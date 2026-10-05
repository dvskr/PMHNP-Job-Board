/**
 * Free-tool links for the call-to-action block at the foot of a blog post.
 *
 * The /tools pages are close to orphaned from the blog. The in-body
 * auto-linker (lib/autoLink.ts) only fires on a tool's literal name, such as
 * "offer analyzer", and the posts almost never use those words, so a salary
 * article could run its full length without once pointing at the tool that
 * answers its question. Matching on the post's TOPIC instead puts the relevant
 * tool under every salary, contract, resume and licensure post.
 *
 * Order is priority: the first matches win when a post touches several topics.
 */
export interface BlogToolLink {
    label: string;
    href: string;
}

/** Enough to be useful, few enough that the job links above still lead. */
export const MAX_BLOG_TOOL_LINKS = 2;

const TOOL_LINKS: ReadonlyArray<BlogToolLink & { match: RegExp }> = [
    { match: /\b(1099|w-?2|contractor|locum|per[\s-]?diem)\b/i, label: '1099 vs W-2 Calculator', href: '/tools/1099-vs-w2-calculator' },
    { match: /\b(resume|cv|ats|interview)\b/i, label: 'Free Resume Checker', href: '/tools/resume-checker' },
    { match: /\b(salary|salaries|offer|negotiat\w*|compensation|raise|pay|income|earn)\b/i, label: 'Offer Analyzer', href: '/tools/offer-analyzer' },
    { match: /\b(hourly|per hour|part[\s-]?time|prn)\b/i, label: 'Hourly to Annual Converter', href: '/tools/salary-converter' },
    { match: /\b(practice authority|independent\w*|licens\w*|collaborat\w*|scope of practice)\b/i, label: 'Practice Authority Map', href: '/tools/practice-authority-map' },
];

/** Tools relevant to a post, judged from its title and opening text. */
export function getBlogToolLinks(text: string): BlogToolLink[] {
    return TOOL_LINKS
        .filter((tool) => tool.match.test(text))
        .slice(0, MAX_BLOG_TOOL_LINKS)
        .map(({ label, href }) => ({ label, href }));
}
