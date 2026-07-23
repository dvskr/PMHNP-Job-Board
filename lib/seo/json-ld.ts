/**
 * Serialize structured data for a <script type="application/ld+json"> sink.
 *
 * JSON.stringify alone is NOT safe inside dangerouslySetInnerHTML: the HTML
 * parser scans raw text for "</script>" without any awareness of JSON string
 * boundaries, so a data value containing `</script><img onerror=…>` terminates
 * the script block early and the rest is parsed as live HTML — stored XSS via
 * aggregator-supplied job titles. Escaping <, >, and & as \uXXXX makes the
 * markup inert while the payload stays byte-identical after JSON.parse, so
 * Google reads exactly the same data.
 *
 * Every JSON-LD sink in the repo must go through this helper — never inline
 * JSON.stringify into dangerouslySetInnerHTML.
 */
export function jsonLdString(data: unknown): string {
  const json = JSON.stringify(data);
  // JSON.stringify(undefined) returns undefined, not a string — normalize to
  // 'null' so a degraded caller emits valid (empty) JSON-LD instead of throwing.
  if (json === undefined) return 'null';
  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
