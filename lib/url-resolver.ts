/**
 * URL Redirect Resolver
 * 
 * Follows HTTP redirect chains to find the final destination URL.
 * Used during ingestion to resolve aggregator tracking URLs
 * (e.g., Adzuna, Jooble) to their final destination.
 * 
 * Only called for NEW jobs that pass all filters/dedup — not for every raw job.
 */

/**
 * Follow redirect chains to resolve the final destination URL.
 * Uses HEAD requests to avoid downloading full page content.
 * 
 * @param url - The URL to resolve
 * @param maxRedirects - Maximum number of redirects to follow (default: 10)
 * @param timeoutMs - Timeout per request in milliseconds (default: 5000)
 * @returns The final resolved URL, or the original URL if resolution fails
 */
export async function resolveApplyUrl(
    url: string,
    maxRedirects: number = 10,
    timeoutMs: number = 5000
): Promise<{ resolvedUrl: string; hopsFollowed: number; wasRedirected: boolean }> {
    let currentUrl = url;
    let hopsFollowed = 0;

    try {
        for (let i = 0; i < maxRedirects; i++) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const response = await fetch(currentUrl, {
                    method: 'HEAD',
                    redirect: 'manual', // Don't auto-follow — we want to track each hop
                    signal: controller.signal,
                    headers: {
                        // Pretend to be a browser to avoid bot blocks
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    },
                });

                clearTimeout(timeout);

                // Check for redirect status codes (301, 302, 303, 307, 308)
                if (response.status >= 300 && response.status < 400) {
                    const location = response.headers.get('location');
                    if (!location) break; // No Location header — stop

                    // Handle relative URLs
                    currentUrl = new URL(location, currentUrl).toString();
                    hopsFollowed++;
                    continue;
                }

                // Non-redirect response — we've arrived at the final destination
                break;

            } catch (fetchError: unknown) {
                clearTimeout(timeout);

                // If HEAD fails (some servers block HEAD), try GET with no body download
                if (fetchError instanceof Error && fetchError.name !== 'AbortError') {
                    try {
                        const controller2 = new AbortController();
                        const timeout2 = setTimeout(() => controller2.abort(), timeoutMs);

                        const getResponse = await fetch(currentUrl, {
                            method: 'GET',
                            redirect: 'manual',
                            signal: controller2.signal,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                            },
                        });

                        clearTimeout(timeout2);

                        if (getResponse.status >= 300 && getResponse.status < 400) {
                            const location = getResponse.headers.get('location');
                            if (!location) break;
                            currentUrl = new URL(location, currentUrl).toString();
                            hopsFollowed++;
                            continue;
                        }

                        break; // Non-redirect — final destination
                    } catch {
                        break; // Both HEAD and GET failed — use what we have
                    }
                }

                break; // Timeout or other error — use what we have
            }
        }
    } catch {
        // Any unexpected error — return original URL safely
        return { resolvedUrl: url, hopsFollowed: 0, wasRedirected: false };
    }

    return {
        resolvedUrl: currentUrl,
        hopsFollowed,
        wasRedirected: hopsFollowed > 0 && currentUrl !== url,
    };
}
