import { describe, expect, it } from 'vitest'
import { parsePost, planSync, type DbPost } from '../../scripts/sync-blog-content'

const mdx = (frontmatter: string, body: string) => `---\n${frontmatter}\n---\n\n${body}\n`

const row = (over: Partial<DbPost> = {}): DbPost => ({
  slug: 'example-post',
  status: 'published',
  title: 'Example Post',
  content: 'Old body.',
  metaDescription: 'Old description.',
  faqJson: null,
  ...over,
})

describe('parsePost', () => {
  it('reads frontmatter fields and returns the body without it', () => {
    const post = parsePost(
      mdx(
        'title: "Example Post"\ndescription: "A description: with a colon."\ndate: "2026-10-05"\ncategory: "policy_industry"\nkeyword: "example keyword"\nslug: "example-post"',
        '## Heading\n\nBody text.',
      ),
      'ignored-file-name.mdx',
    )

    expect(post.slug).toBe('example-post')
    expect(post.title).toBe('Example Post')
    expect(post.description).toBe('A description: with a colon.')
    expect(post.category).toBe('policy_industry')
    expect(post.targetKeyword).toBe('example keyword')
    expect(post.body).toBe('## Heading\n\nBody text.')
  })

  it('falls back to the file name for the slug and to tags for the keyword', () => {
    const post = parsePost(mdx('title: "T"\ntags: ["DEA", "telehealth"]', 'Body.'), 'from-file-name.mdx')

    expect(post.slug).toBe('from-file-name')
    expect(post.targetKeyword).toBe('DEA, telehealth')
  })

  it('parses a single-line faq array and drops malformed entries', () => {
    const post = parsePost(
      mdx('title: "T"\nfaq: [{"name":"Q1?","text":"A1."},{"name":"","text":"no question"},{"nope":true}]', 'Body.'),
      'faq.mdx',
    )

    expect(post.faq).toEqual([{ name: 'Q1?', text: 'A1.' }])
  })

  it('normalizes Windows line endings so a CRLF checkout does not look like an edit', () => {
    const post = parsePost('---\r\ntitle: "T"\r\n---\r\n\r\nLine one.\r\nLine two.\r\n', 'crlf.mdx')

    expect(post.body).toBe('Line one.\nLine two.')
  })
})

describe('planSync', () => {
  const post = (over: Partial<ReturnType<typeof parsePost>> = {}) => ({
    ...parsePost(mdx('title: "Example Post"\ndescription: "New description."\ncategory: "policy_industry"\nslug: "example-post"', 'New body.'), 'example-post.mdx'),
    ...over,
  })

  it('updates a published row whose content differs from the file', () => {
    const [item] = planSync([post()], [row()], { fields: ['content'] })

    expect(item.action).toBe('update')
    expect(item.data).toEqual({ content: 'New body.' })
  })

  it('skips a published row that already matches the file', () => {
    const [item] = planSync([post()], [row({ content: 'New body.\r\n' })], { fields: ['content'] })

    expect(item.action).toBe('skip')
    expect(item.reason).toMatch(/identical/)
  })

  it('never touches a draft row unless that slug was asked for by name', () => {
    const draft = row({ status: 'draft' })

    const [unasked] = planSync([post()], [draft], { fields: ['content'] })
    const [asked] = planSync([post()], [draft], { fields: ['content'], onlySlugs: ['example-post'] })

    expect(unasked.action).toBe('skip')
    expect(unasked.reason).toMatch(/draft/)
    expect(asked.action).toBe('update')
  })

  it('names the real status when it skips an archived row', () => {
    const [skipped] = planSync([post()], [row({ status: 'archived' })], { fields: ['content'] })

    expect(skipped.action).toBe('skip')
    expect(skipped.reason).toMatch(/archived/)
    expect(skipped.reason).not.toMatch(/draft/)
  })

  it('leaves title and description alone unless those fields are requested', () => {
    const [contentOnly] = planSync([post()], [row()], { fields: ['content'] })
    const [withMeta] = planSync([post()], [row({ title: 'Stale Title' })], { fields: ['content', 'title', 'description'] })

    expect(contentOnly.data).not.toHaveProperty('metaDescription')
    expect(withMeta.data).toEqual({ content: 'New body.', title: 'Example Post', metaDescription: 'New description.' })
  })

  it('writes faq only when the file carries one and it differs', () => {
    const faq = [{ name: 'Q?', text: 'A.' }]

    const [added] = planSync([post({ faq })], [row({ content: 'New body.' })], { fields: ['content'] })
    const [same] = planSync([post({ faq })], [row({ content: 'New body.', faqJson: faq })], { fields: ['content'] })

    expect(added.action).toBe('update')
    expect(added.data).toEqual({ faqJson: faq })
    expect(same.action).toBe('skip')
  })

  it('inserts an unseen slug, and refuses one whose category the blog does not have', () => {
    const [fresh] = planSync([post({ slug: 'brand-new' })], [row()], { fields: ['content'] })
    const [badCategory] = planSync([post({ slug: 'brand-new', category: 'licensure' })], [row()], { fields: ['content'] })

    expect(fresh.action).toBe('insert')
    expect(badCategory.action).toBe('skip')
    expect(badCategory.reason).toMatch(/category/)
  })

  it('leaves faqJson out of an insert when the file has no faq, since Prisma rejects a bare null for a Json column', () => {
    const [fresh] = planSync([post({ slug: 'brand-new', faq: null })], [row()], { fields: ['content'] })

    expect(fresh.action).toBe('insert')
    expect(fresh.data).not.toHaveProperty('faqJson')
  })

  it('restricts the plan to the requested slugs', () => {
    const plan = planSync([post(), post({ slug: 'other' })], [row()], { fields: ['content'], onlySlugs: ['example-post'] })

    expect(plan.map((p) => p.slug)).toEqual(['example-post'])
  })
})
