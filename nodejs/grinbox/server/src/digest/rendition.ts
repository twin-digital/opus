/**
 * The digest's rich rendition (d-1oqjgi9m): one HTML alternative built beside
 * the plain-text body and handed to `mail_sender.send_message` as `body_rich`
 * (d-rd986rrt).
 *
 * The markup here is the only markup the rendition carries (d-h5ycq7rm):
 * every string that entered composition as content — template output, model
 * prose, message-derived text, footer counts — passes through
 * {@link escapeHtml} and reaches the recipient as the characters it is
 * (r-8sg01qdd). The rendition is self-contained: inline styles on its own
 * elements, no external asset, no page background, no body text colour; what
 * it colours is translucent so the mail reads on a light or a dark background
 * (d-zkb393z9).
 *
 * A threshold mark reads per rendition (d-7pviv01j): the text rendition
 * suffixes the item (` (!)`, digest-runner.ts); here the same items are
 * styled instead.
 */

/** Escape a content string for element text / attribute context. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Translucent emphasis for a threshold-marked item (d-7pviv01j, d-zkb393z9). */
const MARKED_STYLE = 'background-color: rgba(255, 196, 0, 0.28); font-weight: 600;'

/** Muted-but-inherited styling for footer/count lines: no colour is set. */
const MUTED_STYLE = 'opacity: 0.72; font-size: 0.9em;'

/** One section of the rich rendition, pre-rendered as plain content strings. */
export interface RichSectionInput {
  readonly title: string
  /** Resolved prose (verbatim text or model output); already plain content. */
  readonly proseBefore?: string | null
  readonly proseAfter?: string | null
  readonly render: 'list' | 'table' | 'count'
  /** `list` items: the same rendered item text the text rendition shows, WITHOUT its suffix mark. */
  readonly items?: readonly { readonly text: string; readonly marked: boolean }[]
  /** `table` headers + rows, cells as plain content strings. */
  readonly columns?: readonly string[]
  readonly rows?: readonly { readonly cells: readonly string[]; readonly marked: boolean }[]
  /** `count` sections report this. */
  readonly count?: number
}

/**
 * Assemble the rich rendition from pre-rendered content. Purely structural:
 * the caller decides what appears (the same accounting the text rendition
 * carries); this module only marks it up and escapes it.
 */
export function renderRichDigest(sections: readonly RichSectionInput[], footerLines: readonly string[]): string {
  const parts: string[] = []
  for (const section of sections) {
    parts.push(renderRichSection(section))
  }
  if (footerLines.length > 0) {
    const lines = footerLines.map((line) => `<p style="margin: 2px 0;">${escapeHtml(line)}</p>`).join('\n')
    parts.push(
      `<div style="${MUTED_STYLE} margin-top: 16px; border-top: 1px solid rgba(128,128,128,0.35); padding-top: 8px;">\n${lines}\n</div>`,
    )
  }
  return `<div style="max-width: 720px;">\n${parts.join('\n')}\n</div>`
}

function renderRichSection(section: RichSectionInput): string {
  const parts: string[] = [`<h2 style="font-size: 1.1em; margin: 16px 0 4px 0;">${escapeHtml(section.title)}</h2>`]
  if (section.proseBefore) {
    parts.push(`<p style="margin: 4px 0;">${escapeHtml(section.proseBefore)}</p>`)
  }
  switch (section.render) {
    case 'list': {
      const items = (section.items ?? [])
        .map((item) => `<li${item.marked ? ` style="${MARKED_STYLE}"` : ''}>${escapeHtml(item.text)}</li>`)
        .join('\n')
      parts.push(`<ul style="margin: 4px 0; padding-left: 20px;">\n${items}\n</ul>`)
      break
    }
    case 'table': {
      const headers = (section.columns ?? [])
        .map(
          (h) =>
            `<th style="text-align: left; padding: 2px 8px; border-bottom: 1px solid rgba(128,128,128,0.35);">${escapeHtml(h)}</th>`,
        )
        .join('')
      const rows = (section.rows ?? [])
        .map((row) => {
          const cells = row.cells.map((cell) => `<td style="padding: 2px 8px;">${escapeHtml(cell)}</td>`).join('')
          return `<tr${row.marked ? ` style="${MARKED_STYLE}"` : ''}>${cells}</tr>`
        })
        .join('\n')
      parts.push(`<table style="border-collapse: collapse; margin: 4px 0;">\n<tr>${headers}</tr>\n${rows}\n</table>`)
      break
    }
    case 'count': {
      const n = section.count ?? 0
      parts.push(`<p style="${MUTED_STYLE} margin: 4px 0;">${n} message${n === 1 ? '' : 's'}</p>`)
      break
    }
  }
  if (section.proseAfter) {
    parts.push(`<p style="margin: 4px 0;">${escapeHtml(section.proseAfter)}</p>`)
  }
  return parts.join('\n')
}
