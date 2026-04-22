export function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string | undefined>
): string {
  const url = new URL(path, baseUrl)

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, value)
      }
    }
  }

  return url.toString()
}
