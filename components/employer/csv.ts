/**
 * CSV serialisation for the employer exports.
 *
 * Two problems the previous inline `"${value}"` template had:
 *
 * 1. A value containing a double quote terminated its own field. A cover
 *    letter reading `I am a "great" fit` shifted every column after it, so
 *    Status, Applied Date and Has Resume landed under the wrong headers.
 *    RFC 4180 says the escape for a quote inside a quoted field is two
 *    quotes.
 * 2. A value starting with = + - @ is executed as a formula by Excel, Sheets
 *    and LibreOffice. The values here are candidate-supplied (name, cover
 *    letter), so an applicant could put `=HYPERLINK(...)` in front of an
 *    employer. Prefixing with an apostrophe makes the cell literal text.
 *
 * Tab and carriage return also open formula evaluation in some versions, so
 * they are treated as leading dangerous characters too.
 */

/** Characters that make a spreadsheet treat the rest of the cell as a formula. */
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

/**
 * One CSV field: formula prefixes neutralised, quotes doubled, always quoted.
 * Always quoting is simpler than deciding per value and is valid CSV either
 * way.
 */
export function csvField(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const safe = FORMULA_PREFIXES.includes(raw[0]) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * Serialises uniform row objects to CSV. Column order and the header row come
 * from the first row's keys, so every row must share a shape. Returns an empty
 * string for no rows, which the caller should treat as nothing to download.
 */
export function toCsv(rows: ReadonlyArray<Record<string, unknown>>): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  return [
    headers.map(csvField).join(','),
    ...rows.map(row => headers.map(h => csvField(row[h])).join(',')),
  ].join('\r\n');
}
