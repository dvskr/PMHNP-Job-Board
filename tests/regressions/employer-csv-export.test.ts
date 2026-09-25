/**
 * The applicants export is built from candidate-supplied text (display name,
 * cover letter). Two things had to hold and did not:
 *
 *   - a double quote inside a value must not terminate its field, or every
 *     column after it lands under the wrong header;
 *   - a value that starts with = + - @ must not be evaluated as a formula when
 *     the employer opens the file in Excel, Sheets or LibreOffice.
 *
 * These pin the OUTPUT rules, not the shape of the serialiser, so the helper
 * can be rewritten as long as the file still parses and stays inert.
 */
import { describe, it, expect } from 'vitest';
import { csvField, toCsv } from '@/components/employer/csv';

/** Minimal RFC 4180 reader, so the assertions test parseability, not a string. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (ch === '"') { inQuotes = false; i += 1; continue; }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') { inQuotes = true; i += 1; continue; }
    if (ch === ',') { row.push(field); field = ''; i += 1; continue; }
    if (ch === '\r' && text[i + 1] === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 2; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 1; continue; }
    field += ch;
    i += 1;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

describe('applicants CSV export', () => {
  it('keeps every column aligned when a value contains double quotes', () => {
    const csv = toCsv([
      { Name: 'Dana Reed', 'Cover Letter': 'I am a "great" fit for this role', Status: 'Applied' },
    ]);

    const [header, first] = parseCsv(csv);
    expect(header).toEqual(['Name', 'Cover Letter', 'Status']);
    expect(first).toEqual(['Dana Reed', 'I am a "great" fit for this role', 'Applied']);
  });

  it('survives a value crafted to break out of its own field', () => {
    // The classic payload: close the quote, inject columns, reopen it.
    const attack = '",=cmd|\' /C calc\'!A0,"';
    const csv = toCsv([{ Name: attack, Status: 'Applied' }]);

    const [, first] = parseCsv(csv);
    expect(first).toHaveLength(2);
    expect(first[1]).toBe('Applied');
  });

  it('neutralises every leading character a spreadsheet treats as a formula', () => {
    for (const prefix of ['=', '+', '-', '@', '\t', '\r']) {
      expect(csvField(`${prefix}HYPERLINK("https://example.com")`)).toBe(
        `"'${prefix}HYPERLINK(""https://example.com"")"`,
      );
    }
  });

  it('leaves a value that merely contains a formula character alone', () => {
    expect(csvField('Nurse Practitioner (PMHNP-BC) 3+ years')).toBe('"Nurse Practitioner (PMHNP-BC) 3+ years"');
  });

  it('renders null and undefined as empty cells rather than the words', () => {
    const [, first] = parseCsv(toCsv([{ A: null, B: undefined, C: 'x' }]));
    expect(first).toEqual(['', '', 'x']);
  });

  it('newlines inside a value stay inside that value', () => {
    const rows = parseCsv(toCsv([{ Note: 'line one\nline two' }, { Note: 'second row' }]));
    expect(rows).toEqual([['Note'], ['line one\nline two'], ['second row']]);
  });

  it('returns nothing to download when there are no rows', () => {
    expect(toCsv([])).toBe('');
  });
});
