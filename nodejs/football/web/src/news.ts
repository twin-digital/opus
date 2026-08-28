/**
 * Conservative news-body sanitizer: news item bodies arrive as raw source HTML and the page
 * renders text only. Drops script/style/comment content entirely, treats block boundaries as
 * paragraph breaks, strips every remaining tag, then decodes entities. No external libs.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
}

export const decodeEntities = (text: string): string =>
  text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16)
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole
  })

/** Tags whose closing (or self-closing) edge ends a paragraph. */
const BLOCK_BREAK = /<\/(?:p|div|li|ul|ol|h[1-6]|blockquote|tr|table|section|article)\s*>|<br\s*\/?>/gi

/** Strip a raw HTML body to plain-text paragraphs; empty input yields no paragraphs. */
export const newsBodyParagraphs = (body: string | null): string[] => {
  if (body === null || body.length === 0) {
    return []
  }
  const text = body
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|iframe|object|embed)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(BLOCK_BREAK, '\n')
    .replace(/<[^>]*>/g, '')
  return decodeEntities(text)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
}
