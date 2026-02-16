/**
 * Auto-format blog content for better readability.
 *
 * Transforms plain/loosely-formatted markdown from n8n into
 * well-structured content with bullet lists, bold key phrases,
 * numbered steps, blockquotes, and proper internal links.
 */

// ─── Internal Link Formatting ────────────────────────────────────────────────

/** Map of known PMHNP Hiring URLs to descriptive link text */
const INTERNAL_LINK_MAP: [RegExp, string][] = [
    [/https?:\/\/pmhnphiring\.com\/jobs\?type=remote/g, 'Browse remote PMHNP jobs →'],
    [/https?:\/\/pmhnphiring\.com\/jobs\?type=telehealth/g, 'Browse telehealth PMHNP jobs →'],
    [/https?:\/\/pmhnphiring\.com\/jobs\?type=travel/g, 'Browse travel PMHNP jobs →'],
    [/https?:\/\/pmhnphiring\.com\/jobs\/remote/g, 'Browse remote PMHNP jobs →'],
    [/https?:\/\/pmhnphiring\.com\/jobs\/telehealth/g, 'Browse telehealth jobs →'],
    [/https?:\/\/pmhnphiring\.com\/jobs\/travel/g, 'Browse travel PMHNP jobs →'],
    [/https?:\/\/pmhnphiring\.com\/jobs\/new-grad/g, 'Browse new grad PMHNP jobs →'],
    [/https?:\/\/pmhnphiring\.com\/jobs\/per-diem/g, 'Browse per diem PMHNP jobs →'],
    [/https?:\/\/pmhnphiring\.com\/salary-guide/g, 'PMHNP Salary Guide'],
    [/https?:\/\/pmhnphiring\.com\/salaries/g, 'PMHNP Salary Data'],
    [/https?:\/\/pmhnphiring\.com\/job-alerts/g, 'Set up job alerts'],
    [/https?:\/\/pmhnphiring\.com\/jobs/g, 'Browse all PMHNP jobs →'],
];

/** Convert raw pmhnphiring.com URLs into descriptive markdown links */
function formatInternalLinks(content: string): string {
    // Don't touch URLs already inside markdown links [text](url)
    // Process line by line to avoid breaking existing markdown links
    return content
        .split('\n')
        .map((line) => {
            // Skip lines that already have markdown link syntax
            if (/\[.*?\]\(https?:\/\/pmhnphiring\.com/.test(line)) return line;

            // Handle state page URLs: /states/california → "PMHNP jobs in California"
            line = line.replace(
                /(?<!\]\()https?:\/\/pmhnphiring\.com\/states\/([a-z-]+)/g,
                (_, state: string) => {
                    const stateName = state
                        .split('-')
                        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                        .join(' ');
                    return `[PMHNP jobs in ${stateName}](https://pmhnphiring.com/states/${state})`;
                }
            );

            // Handle known internal URLs
            for (const [pattern, label] of INTERNAL_LINK_MAP) {
                line = line.replace(pattern, (url) => `[${label}](${url})`);
            }

            // Catch-all: any remaining raw pmhnphiring.com URLs
            line = line.replace(
                /(?<!\]\()(?<!\()(https?:\/\/pmhnphiring\.com\/[^\s),."]+)/g,
                (url) => `[Learn more →](${url})`
            );

            return line;
        })
        .join('\n');
}

// ─── Sequential Paragraph → Bullet List Conversion ──────────────────────────

/** Ordinal word starters that indicate a sequential list */
const ORDINAL_STARTERS = [
    /^First(?:\s+is|\s+,|,|\s)/i,
    /^Second(?:\s+is|\s+,|,|\s)/i,
    /^Third(?:\s+is|\s+,|,|\s)/i,
    /^Fourth(?:\s+is|\s+,|,|\s)/i,
    /^Fifth(?:\s+is|\s+,|,|\s)/i,
];

/** Alternative list starters: "One is...", "Another is..." */
const ALT_LIST_STARTERS = [
    /^One\s+is\s/i,
    /^Another\s+is\s/i,
    /^Also[\s,]/i,
    /^Finally[\s,]/i,
    /^Watch\s+for\s/i,
    /^Also\s+look\s+for\s/i,
    /^Be\s+cautious\s/i,
];

/** Step-by-step instruction starters */
const STEP_STARTERS = [
    /^Start\s+(?:with|by)\s/i,
    /^Next[\s,]/i,
    /^Then[\s,]/i,
    /^Finally[\s,]/i,
    /^After\s+that[\s,]/i,
    /^Last(?:ly)?[\s,]/i,
];

/**
 * Detect if a run of consecutive paragraphs forms a sequential list,
 * and convert them to markdown bullet or numbered list items.
 */
function convertSequentialParagraphs(content: string): string {
    const lines = content.split('\n');
    const result: string[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i].trim();

        // Check if this line starts a sequential ordinal pattern
        if (ORDINAL_STARTERS[0].test(line)) {
            // Look ahead for matching ordinals
            const listItems: string[] = [line];
            let j = i + 1;

            while (j < lines.length) {
                const nextLine = lines[j].trim();
                if (nextLine === '') {
                    j++;
                    continue;
                }
                // Check if it matches any ordinal or alt-list starter
                const matchesOrdinal = ORDINAL_STARTERS.some((r) => r.test(nextLine));
                const matchesAlt = ALT_LIST_STARTERS.some((r) => r.test(nextLine));
                if (matchesOrdinal || matchesAlt) {
                    listItems.push(nextLine);
                    j++;
                } else {
                    break;
                }
            }

            // Only convert if we found at least 2 items
            if (listItems.length >= 2) {
                result.push('');
                for (const item of listItems) {
                    // Bold the first sentence for scannability
                    const bolded = boldFirstSentence(item);
                    result.push(`- ${bolded}`);
                }
                result.push('');
                i = j;
                continue;
            }
        }

        // Check if this line starts a step-by-step pattern
        if (STEP_STARTERS[0].test(line)) {
            const stepItems: string[] = [line];
            let j = i + 1;

            while (j < lines.length) {
                const nextLine = lines[j].trim();
                if (nextLine === '') {
                    j++;
                    continue;
                }
                if (STEP_STARTERS.some((r) => r.test(nextLine))) {
                    stepItems.push(nextLine);
                    j++;
                } else {
                    break;
                }
            }

            if (stepItems.length >= 2) {
                result.push('');
                stepItems.forEach((item, idx) => {
                    const bolded = boldFirstSentence(item);
                    result.push(`${idx + 1}. ${bolded}`);
                });
                result.push('');
                i = j;
                continue;
            }
        }

        result.push(lines[i]);
        i++;
    }

    return result.join('\n');
}

// ─── Bold Injection ─────────────────────────────────────────────────────────

/** Bold the first sentence/clause of a paragraph for scannability */
function boldFirstSentence(text: string): string {
    // If already has bold markers, skip
    if (text.includes('**')) return text;

    // Find the end of the first sentence (period, question mark, exclamation, or comma with enough length)
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

/** Bold key statistics: percentages, dollar amounts, and year ranges */
function boldStatistics(content: string): string {
    // Bold dollar amounts like $139K, $155,000, $126K–$155K
    content = content.replace(
        /(?<!\*\*)(\$[\d,]+K?(?:\s*[–-]\s*\$[\d,]+K?)?)(?!\*\*)/g,
        '**$1**'
    );

    // Bold percentages like 35%, 62%
    content = content.replace(
        /(?<!\*\*)(\d+%(?:\s*[–-]\s*\d+%)?)(?!\*\*)/g,
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
 * Applies: internal links, sequential lists, bold stats,
 * callouts, heading spacing, and cleanup.
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
