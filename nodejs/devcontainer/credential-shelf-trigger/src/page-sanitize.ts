/**
 * Browser-safe sanitizers for the operator page. These are self-contained (no imports, no external
 * references) because they are embedded VERBATIM into the page's inline `<script>` via `.toString()`
 * — so the guard that ships in the page IS this function, and a unit test of it here tests exactly
 * what runs in the browser (no source-vs-shipped divergence).
 */

/** HTML-escape a value for safe interpolation into element text / double-quoted attributes. */
export const esc = (s: unknown): string =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

/** Return the URL only if it is an http(s) URL; otherwise '' — never link a javascript:/data: URL. */
export const safeUrl = (u: unknown): string => {
  const s = typeof u === 'string' ? u : ''
  return /^https?:\/\//i.test(s) ? s : ''
}
