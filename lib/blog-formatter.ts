/**
 * Auto-format blog content for better readability.
 *
 * Transforms plain/loosely-formatted markdown from n8n into
 * well-structured content with bullet lists, bold key phrases,
 * numbered steps, blockquotes, and proper internal links.
 */

// ─── Internal Link Formatting ────────────────────────────────────────────────

/**
 * Map of known PMHNP Hiring URL patterns to descriptive link text.
 * Order matters: more specific patterns first to avoid partial matches.
 */
const INTERNAL_LINK_MAP: [RegExp, string][] = [
    [/https?:\/\/pmhnphiring\.com\/jobs\?type=remote\b/g, 'Browse remote PMHNP jobs →'],
    [/https?:\/\/pmhnphiring\.com\/jobs\?type=telehealth\b/g, 'Browse telehealth PMHNP jobs →'],
    [/https?:\/\/pmhnphiring\.com\/jobs\?type=travel\b/g, 'Browse travel PMHNP jobs →'],
    [/https?:\/\/pmhnphiring\.com\/jobs\/remote\b/g, 'Browse remote PMHNP jobs →'],
    [/https?:\/\/pmhnphiring\.com\/jobs\/telehealth\b/g, 'Browse telehealth jobs →'],
    [/https?:\/\/pmhnphiring\.com\/jobs\/travel\b/g, 'Browse travel PMHNP jobs →'],
    [/https?:\/\/pmhnphiring\.com\/jobs\/new-grad\b/g, 'Browse new grad PMHNP jobs →'],
    [/https?:\/\/pmhnphiring\.com\/jobs\/per-diem\b/g, 'Browse per diem PMHNP jobs →'],
    [/https?:\/\/pmhnphiring\.com\/salary-guide\b/g, 'PMHNP Salary Guide'],
    [/https?:\/\/pmhnphiring\.com\/salaries\b/g, 'PMHNP Salary Data'],
    [/https?:\/\/pmhnphiring\.com\/job-alerts\b/g, 'Set up job alerts'],
    [/https?:\/\/pmhnphiring\.com\/jobs\b/g, 'Browse all PMHNP jobs →'],
];

/** Regex to match a raw URL (not already inside a markdown link) */
const RAW_URL_RE = /(?<!\]\()(?<!\()(?<!")(?<!\[)(https?:\/\/pmhnphiring\.com\/[^\s)"',;!>\]]*[^\s)"',;!.>\]])/g;

/** Convert raw pmhnphiring.com URLs into descriptive markdown links */
function formatInternalLinks(content: string): string {
    return content
        .split('\n')
        .map((line) => {
            // Skip lines that already contain well-formed markdown links to pmhnphiring.com
            if (/\[.+?\]\(https?:\/\/pmhnphiring\.com/.test(line)) return line;

            // Handle state page URLs: /states/california → "PMHNP jobs in California"
            line = line.replace(
                RAW_URL_RE,
                (url) => {
                    // Match state pages
                    const stateMatch = url.match(/\/states\/([a-z-]+)/);
                    if (stateMatch) {
                        const stateName = stateMatch[1]
                            .split('-')
                            .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                            .join(' ');
                        return `[PMHNP jobs in ${stateName}](${url})`;
                    }

                    // Match known URL patterns
                    for (const [pattern, label] of INTERNAL_LINK_MAP) {
                        // Reset regex lastIndex for global patterns
                        pattern.lastIndex = 0;
                        if (pattern.test(url)) {
                            return `[${label}](${url})`;
                        }
                    }

                    // Catch-all for other internal URLs
                    return `[Learn more →](${url})`;
                }
            );

            return line;
        })
        .join('\n');
}

// ─── Sequential Paragraph → List Conversion ─────────────────────────────────

/** Check if text starts with ordinal words */
function startsWithOrdinal(text: string): boolean {
    return /^(First|Second|Third|Fourth|Fifth)(\s+is|\s*,|\s)/i.test(text);
}

/** Check if text starts with "red flag" style list phrases */
function startsWithListPhrase(text: string): boolean {
    return /^(One\s+is|Another\s+is|Also\s|Watch\s+for\s|Also\s+look\s+for|Be\s+cautious)/i.test(text);
}

/** Check if text starts with step-by-step instruction words */
function startsWithStep(text: string): boolean {
    return /^(Start\s+(with|by)\s|Next[\s,]|Then[\s,]|Finally[\s,]|After\s+that[\s,]|Last(ly)?[\s,])/i.test(text);
}

/**
 * Split content into paragraphs (separated by blank lines or headings),
 * then detect sequential patterns and convert to lists.
 */
function convertSequentialParagraphs(content: string): string {
    // Split into paragraphs (blocks separated by blank lines)
    const blocks = content.split(/\n\n+/);
    const result: string[] = [];
    let i = 0;

    while (i < blocks.length) {
        const block = blocks[i].trim();

        // Skip headings and already-formatted content
        if (block.startsWith('#') || block.startsWith('-') || block.startsWith('1.') || block.startsWith('>')) {
            result.push(blocks[i]);
            i++;
            continue;
        }

        // Check for ordinal pattern: "First is..." / "Second is..." / "Third is..."
        if (startsWithOrdinal(block)) {
            const listItems: string[] = [block];
            let j = i + 1;

            while (j < blocks.length) {
                const nextBlock = blocks[j].trim();
                if (nextBlock === '') { j++; continue; }
                if (startsWithOrdinal(nextBlock) || startsWithListPhrase(nextBlock)) {
                    listItems.push(nextBlock);
                    j++;
                } else {
                    break;
                }
            }

            if (listItems.length >= 2) {
                result.push(listItems.map((item) => `- ${boldFirstSentence(item)}`).join('\n'));
                i = j;
                continue;
            }
        }

        // Check for "red flag" style lists: "One is..." / "Another is..."
        if (startsWithListPhrase(block)) {
            const listItems: string[] = [block];
            let j = i + 1;

            while (j < blocks.length) {
                const nextBlock = blocks[j].trim();
                if (nextBlock === '') { j++; continue; }
                if (startsWithListPhrase(nextBlock)) {
                    listItems.push(nextBlock);
                    j++;
                } else {
                    break;
                }
            }

            if (listItems.length >= 2) {
                result.push(listItems.map((item) => `- ${boldFirstSentence(item)}`).join('\n'));
                i = j;
                continue;
            }
        }

        // Check for step-by-step: "Start with..." / "Next..." / "Then..." / "Finally..."
        if (startsWithStep(block)) {
            const stepItems: string[] = [block];
            let j = i + 1;

            while (j < blocks.length) {
                const nextBlock = blocks[j].trim();
                if (nextBlock === '') { j++; continue; }
                if (startsWithStep(nextBlock)) {
                    stepItems.push(nextBlock);
                    j++;
                } else {
                    break;
                }
            }

            if (stepItems.length >= 2) {
                result.push(
                    stepItems
                        .map((item, idx) => `${idx + 1}. ${boldFirstSentence(item)}`)
                        .join('\n')
                );
                i = j;
                continue;
            }
        }

        result.push(blocks[i]);
        i++;
    }

    return result.join('\n\n');
}

// ─── Bold Injection ─────────────────────────────────────────────────────────

/** Bold the first sentence/clause of a paragraph for scannability */
function boldFirstSentence(text: string): string {
    // If already has bold markers, skip
    if (text.includes('**')) return text;

    // Find the end of the first sentence (period, question mark, exclamation)
    const match = text.match(/^(.{15,}?[.!?])\s/);
    if (match) {
        return `**${match[1]}** ${text.slice(match[0].length)}`;
    }

    // Fallback: bold up to the first comma if the clause is substantial
    const commaMatch = text.match(/^(.{15,}?),\s/);
    if (commaMatch) {
        return `**${commaMatch[1]}**, ${text.slice(commaMatch[0].length)}`;
    }

    return text;
}

/** Bold key statistics: percentages, dollar amounts, and day counts */
function boldStatistics(content: string): string {
    // Bold dollar amounts like $139K, $155,000, $126K–$155K
    // Negative lookbehind for ** and [ to avoid double-bolding or breaking links
    content = content.replace(
        /(?<!\*\*)(?<!\[)(\$[\d,]+K?(?:\s*[–-]\s*\$[\d,]+K?)?)(?!\*\*)(?!\])/g,
        '**$1**'
    );

    // Bold percentages like 35%, 62%
    content = content.replace(
        /(?<!\*\*)(?<!\d)(\d{1,3}%(?:\s*[–-]\s*\d{1,3}%)?)(?!\*\*)/g,
        '**$1**'
    );

    // Bold "X days" patterns like "32 days", "45 days"
    content = content.replace(
        /(?<!\*\*)(\d+\s+days?)(?!\*\*)/gi,
        '**$1**'
    );

    return content;
}

// ─── Blockquote Callouts ─────────────────────────────────────────────────────

/** Detect tip/note/important patterns and convert to blockquotes */
function formatCallouts(content: string): string {
    return content.replace(
        /^((?:Pro\s+)?Tip|Note|Important|Warning|Key\s+takeaway)[:\s]+(.+)$/gim,
        (_, label: string, text: string) => `> **${label}:** ${text}`
    );
}

// ─── Heading Spacing ─────────────────────────────────────────────────────────

/** Ensure blank lines before and after headings */
function fixHeadingSpacing(content: string): string {
    // Add blank line before headings (if not already there)
    content = content.replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2');
    // Add blank line after headings (if not already there)
    content = content.replace(/(#{1,6}\s.+)\n([^\n#])/g, '$1\n\n$2');
    return content;
}

// ─── Clean Up ────────────────────────────────────────────────────────────────

/** Remove excessive blank lines (max 2 consecutive) */
function cleanBlankLines(content: string): string {
    return content.replace(/\n{4,}/g, '\n\n\n');
}

// ─── Main Formatter ──────────────────────────────────────────────────────────

/**
 * Auto-format blog markdown content for better readability.
 * Applies: heading spacing, sequential list detection, callouts,
 * bold statistics, internal links, and cleanup.
 */
export function formatBlogContent(content: string): string {
    if (!content || content.trim().length === 0) return content;

    let formatted = content;

    // 1. Fix heading spacing first (structural)
    formatted = fixHeadingSpacing(formatted);

    // 2. Convert sequential paragraphs to lists
    formatted = convertSequentialParagraphs(formatted);

    // 3. Format callout patterns
    formatted = formatCallouts(formatted);

    // 4. Bold key statistics
    formatted = boldStatistics(formatted);

    // 5. Convert raw internal URLs to markdown links
    formatted = formatInternalLinks(formatted);

    // 6. Clean up excessive blank lines
    formatted = cleanBlankLines(formatted);

    return formatted.trim();
}
