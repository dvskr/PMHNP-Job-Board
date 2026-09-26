/**
 * Company URL slugs.
 *
 * `Company.normalizedName` is the DB key, and the normalizer that writes it
 * emits kebab-case today. Rows created before that change still hold the old
 * space-separated form ("life stance"), and /companies linked straight to it,
 * so the index shipped hrefs like `/companies/life stance` and the company
 * page echoed the literal space back in its canonical tag.
 *
 * app/companies/[slug]/page.tsx resolves a slug by trying an exact match and
 * then turning EVERY hyphen back into a space. That round trip is lossy for a
 * legacy name that already contains a hyphen ("foo bar-baz" would be looked up
 * as "foo bar baz" and 404), so those names are deliberately left alone: a
 * slightly ugly URL that resolves beats a clean one that does not.
 */
export function companyUrlSlug(normalizedName: string): string {
    const kebab = normalizedName.replace(/\s+/g, '-');
    return kebab.replace(/-/g, ' ') === normalizedName ? kebab : normalizedName;
}
