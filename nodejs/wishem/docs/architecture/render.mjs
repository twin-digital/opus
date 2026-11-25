// Writes the SVG diagrams of the architecture documents.
// Usage: node render.mjs
// Each diagram is described once, below. The script writes one file for each theme.
// Colors come from the role tokens of the workbench. Text uses the standard typeface of the system.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const here = import.meta.dirname
const tokensFile = join(here, '..', '..', 'workbench-app', 'src', 'styles', 'tokens.css')

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

/** Reads the custom properties of the `:root, [data-theme]` block. */
const readTokens = () => {
  const css = readFileSync(tokensFile, 'utf8')
  const block = /:root,\s*\[data-theme\]\s*\{([^}]*)\}/.exec(css)
  if (!block) {
    throw new Error(`No token block in ${tokensFile}`)
  }
  const tokens = new Map()
  for (const match of block[1].matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    tokens.set(match[1], match[2].trim())
  }
  return tokens
}

/** Gives the color of a role token in one theme. */
const resolveColor = (tokens, name, theme) => {
  const read = (tokenName) => {
    const value = tokens.get(tokenName)
    if (value === undefined) {
      throw new Error(`Token --${tokenName} is not in ${tokensFile}`)
    }
    return value
  }
  let value = read(name)
  while (/var\(--/.test(value)) {
    value = value.replace(/var\(--([a-z0-9-]+)\)/g, (_, inner) => read(inner))
  }
  value = value.replace(/light-dark\(\s*([^,()]+?)\s*,\s*([^,()]+?)\s*\)/g, (_, light, dark) =>
    theme === 'light' ? light : dark,
  )
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`Token --${name} is not a plain color in the ${theme} theme: ${value}`)
  }
  return value.toLowerCase()
}

/** Mixes color `b` into color `a`. `amount` is the share of `b`, from 0 to 1. */
const mix = (a, b, amount) => {
  const channel = (hex, index) => parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16)
  return `#${[0, 1, 2]
    .map((index) =>
      Math.round(channel(a, index) * (1 - amount) + channel(b, index) * amount)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

const roles = {
  ground: 'ground',
  surface: 'surface',
  line: 'line',
  night: 'night',
  fg: 'fg',
  fgMuted: 'fg-muted',
  controlBorder: 'control-border',
  maker: 'maker',
  makerText: 'maker-text',
  accentText: 'accent-text',
}

/** The colors of one theme: the role tokens and the tints that the diagrams derive from them. */
const buildColors = (tokens, theme) => {
  const c = Object.fromEntries(Object.entries(roles).map(([key, token]) => [key, resolveColor(tokens, token, theme)]))
  return {
    ...c,
    groupFill: mix(c.ground, c.accentText, 0.07),
    tint: mix(c.surface, c.accentText, 0.12),
    markedFill: mix(c.surface, c.maker, 0.12),
    border: mix(c.line, c.fgMuted, 0.2),
    flow: c.makerText,
    quiet: c.controlBorder,
  }
}

// ---------------------------------------------------------------------------
// Text: the one place that decides how text is drawn
// ---------------------------------------------------------------------------

const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

// Width of a glyph as a share of the font size. The values assume a wide system font.
const WIDTH = { regular: 0.6, bold: 0.62, upper: 0.7 }

const escapeXml = (value) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

const num = (value) => String(Math.round(value * 100) / 100)

/** The estimated width of a line, for the overflow check. */
const textWidth = (line, { size, weight = 400, spacing = 0, upper = false }) => {
  const glyph =
    upper ? WIDTH.upper
    : weight >= 600 ? WIDTH.bold
    : WIDTH.regular
  return line.length * (size * glyph + spacing)
}

/** Draws one line of text. `maxWidth` is the width that the text must fit in. */
const text = (
  c,
  { x, y, line, size = 13, weight = 400, color = c.fg, anchor = 'start', spacing = 0, upper = false, maxWidth },
) => {
  if (maxWidth !== undefined && textWidth(line, { size, weight, spacing, upper }) > maxWidth) {
    throw new Error(`The text does not fit in ${String(maxWidth)} px: ${line}`)
  }
  const extra = spacing === 0 ? '' : ` letter-spacing="${num(spacing)}"`
  const content = escapeXml(upper ? line.toUpperCase() : line)
  return `<text x="${num(x)}" y="${num(y)}" font-family="${SANS}" font-weight="${String(weight)}" font-size="${num(size)}" fill="${color}" text-anchor="${anchor}"${extra}>${content}</text>`
}

// ---------------------------------------------------------------------------
// Icons: simple line icons on a 40 x 40 grid, drawn with one stroke weight
// ---------------------------------------------------------------------------

const FILE = 'M10 4h13l9 9v21a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM23 4v9h9'

const icons = {
  person: '<circle cx="20" cy="12" r="6.5"/><path d="M7 35c0-8 6-12 13-12s13 4 13 12"/>',
  browser: '<rect x="4" y="7" width="32" height="26" rx="4"/><path d="M4 15h32M9 11h.01M13 11h.01M17 11h.01"/>',
  bolt: '<path d="M23 4 11 22h8l-2 14 12-19h-8z"/>',
  server:
    '<rect x="6" y="6" width="28" height="11" rx="3"/><rect x="6" y="23" width="28" height="11" rx="3"/><path d="M12 11.5h.01M12 28.5h.01"/>',
  folder: '<path d="M4 12a3 3 0 0 1 3-3h8l4 4h14a3 3 0 0 1 3 3v15a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z"/>',
  file: `<path d="${FILE}M14 22h12M14 28h12"/>`,
  state: `<path d="${FILE}"/><circle cx="20" cy="26" r="4"/>`,
  viewFile: `<path d="${FILE}M17 21l-4 4 4 4M23 21l4 4-4 4"/>`,
  snapshot:
    '<path d="M6 14V9a3 3 0 0 1 3-3h5M26 6h5a3 3 0 0 1 3 3v5M34 26v5a3 3 0 0 1-3 3h-5M14 34H9a3 3 0 0 1-3-3v-5"/><circle cx="20" cy="20" r="5"/>',
  table: '<rect x="4" y="8" width="32" height="24" rx="3"/><path d="M4 16h32M4 24h32M16 8v24"/>',
  wand: '<path d="M7 33 25 15M29 4v9M24.5 8.5h9M33 24h.01M12 10h.01"/>',
}

const icon = ({ name, x, y, size, color }) => {
  const scale = size / 40
  return `<g transform="translate(${num(x)} ${num(y)}) scale(${num(scale)})" fill="none" stroke="${color}" stroke-width="${num(2 / scale)}" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</g>`
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

const PAD = 8

const rect = ({ x, y, w, h }, radius, attributes) =>
  `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" rx="${num(radius)}" ${attributes}/>`

/** A tinted, round container with a small uppercase label. */
const group = (c, item) =>
  [
    rect(item, 18, `fill="${c.groupFill}" stroke="${c.line}"`),
    text(c, {
      x: item.x + 16,
      y: item.y + 30,
      line: item.label,
      size: 13,
      weight: 600,
      color: c.accentText,
      spacing: 0.6,
      upper: true,
      maxWidth: item.w - 32,
    }),
  ].join('\n')

/**
 * A card: an icon over a title, with an optional short second line.
 * `variant` is `plain`, `maker` (filled with the accent), or `marked` (outlined with the accent).
 * `art` draws a picture in place of the icon. The title then sits at the bottom.
 */
const card = (c, item) => {
  const { x, y, w, h, variant = 'plain', title, sub, art, iconSize = 40 } = item
  const fill = { plain: c.surface, maker: c.maker, marked: c.markedFill }[variant]
  const stroke =
    variant === 'maker' ? 'none'
    : variant === 'marked' ? `${c.flow}" stroke-width="1.5`
    : c.border
  const inner = w - 2 * PAD
  const gap = 14
  const block = (art ? 0 : iconSize + gap) + 12 + (sub ? 22 : 0)
  const top = art ? y + h - 24 - (sub ? 22 : 0) - 12 : y + (h - block) / 2
  const titleY = art ? top + 12 : top + iconSize + gap + 12
  const out = [
    rect(
      item,
      14,
      `fill="${fill}" stroke="${stroke}"${item.shadow === false || !c.hasShadow ? '' : ' filter="url(#shadow)"'}`,
    ),
  ]
  if (art) {
    out.push(art(c, item))
  } else {
    const color = variant === 'maker' ? c.night : c.accentText
    out.push(icon({ name: item.icon, x: x + (w - iconSize) / 2, y: top, size: iconSize, color }))
  }
  out.push(
    text(c, {
      x: x + w / 2,
      y: titleY,
      line: title,
      size: 15,
      weight: 600,
      color: variant === 'maker' ? c.night : c.fg,
      anchor: 'middle',
      maxWidth: inner,
    }),
  )
  if (sub) {
    out.push(text(c, { x: x + w / 2, y: titleY + 20, line: sub, color: c.fgMuted, anchor: 'middle', maxWidth: inner }))
  }
  return out.join('\n')
}

// Least visible line, in px, of an arrow. A labeled arrow keeps `MIN_SIDE` on each side of its pill.
const MIN_PLAIN = 56
const MIN_SIDE = 28
const PILL_HEIGHT = 24

const pillWidth = (line) => textWidth(line, { size: 13, weight: 500 }) + 22

/** Fails the run when an arrow is too short to read, or when its pill leaves too little line. */
const checkLength = ({ points, label }) => {
  let length = 0
  let before
  let half = 0
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]
    const [bx, by] = points[i]
    if (label !== undefined && before === undefined) {
      const [px, py] = label.at
      const onSegment =
        (bx - ax) * (py - ay) === (by - ay) * (px - ax) &&
        px >= Math.min(ax, bx) &&
        px <= Math.max(ax, bx) &&
        py >= Math.min(ay, by) &&
        py <= Math.max(ay, by)
      if (onSegment) {
        before = length + Math.hypot(px - ax, py - ay)
        half = ay === by ? pillWidth(label.line) / 2 : PILL_HEIGHT / 2
      }
    }
    length += Math.hypot(bx - ax, by - ay)
  }
  if (label === undefined) {
    if (length < MIN_PLAIN) {
      throw new Error(`The arrow shows ${num(length)} px of line, less than ${String(MIN_PLAIN)} px`)
    }
    return
  }
  if (before === undefined) {
    throw new Error(`The label is not on its arrow: ${label.line}`)
  }
  const side = Math.min(before - half, length - before - half)
  if (side < MIN_SIDE) {
    throw new Error(
      `The label leaves ${num(side)} px of line beside it, less than ${String(MIN_SIDE)} px: ${label.line}`,
    )
  }
}

const ARROW_RADIUS = 10
const HEAD_LENGTH = 11
const HEAD_HALF = 5.5

/** The path through `points` with round corners. It stops at `end`. */
const roundedPath = (points, end) => {
  const all = [...points.slice(0, -1), end]
  let d = `M${num(all[0][0])} ${num(all[0][1])}`
  for (let i = 1; i < all.length - 1; i++) {
    const [px, py] = all[i - 1]
    const [cx, cy] = all[i]
    const [nx, ny] = all[i + 1]
    const before = Math.hypot(cx - px, cy - py)
    const after = Math.hypot(nx - cx, ny - cy)
    const r = Math.min(ARROW_RADIUS, before / 2, after / 2)
    d += ` L${num(cx - ((cx - px) / before) * r)} ${num(cy - ((cy - py) / before) * r)}`
    d += ` Q${num(cx)} ${num(cy)} ${num(cx + ((nx - cx) / after) * r)} ${num(cy + ((ny - cy) / after) * r)}`
  }
  const last = all[all.length - 1]
  return `${d} L${num(last[0])} ${num(last[1])}`
}

/**
 * An arrow along `points` with a head at the last point. A label of one or two words sits on a chip at `label.at`.
 * `tone` is `flow` (accent) or `quiet` (neutral).
 */
const arrow = (c, item) => {
  const stroke = c[item.tone ?? 'quiet']
  const { points } = item
  const [tipX, tipY] = points[points.length - 1]
  const [fromX, fromY] = points[points.length - 2]
  const length = Math.hypot(tipX - fromX, tipY - fromY)
  const ux = (tipX - fromX) / length
  const uy = (tipY - fromY) / length
  const baseX = tipX - ux * HEAD_LENGTH
  const baseY = tipY - uy * HEAD_LENGTH
  const head = [
    [tipX, tipY],
    [baseX - uy * HEAD_HALF, baseY + ux * HEAD_HALF],
    [baseX + uy * HEAD_HALF, baseY - ux * HEAD_HALF],
  ]
    .map(([x, y]) => `${num(x)},${num(y)}`)
    .join(' ')
  const out = [
    `<path d="${roundedPath(points, [baseX + ux, baseY + uy])}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<polygon points="${head}" fill="${stroke}" stroke="${stroke}" stroke-width="1" stroke-linejoin="round"/>`,
  ]
  checkLength(item)
  if (item.label !== undefined) {
    const { line, at } = item.label
    const width = pillWidth(line)
    out.push(
      rect({ x: at[0] - width / 2, y: at[1] - 12, w: width, h: 24 }, 12, `fill="${c.surface}" stroke="${stroke}"`),
      text(c, {
        x: at[0],
        y: at[1] + 4.5,
        line,
        weight: 500,
        color: item.tone === 'flow' ? c.flow : c.fgMuted,
        anchor: 'middle',
      }),
    )
  }
  return out.join('\n')
}

/** A small page with an app bar. A dashed outline marks the app bar. */
const appBarPicture = (c, { x, y, w, h }) => {
  const left = x + 18
  const width = w - 36
  const bar = { x: left + 8, y: y + 26, w: width - 16, h: 42 }
  const bits = [
    rect({ x: left, y, w: width, h }, 12, `fill="${c.ground}" stroke="${c.border}"`),
    rect(bar, 8, `fill="${c.accentText}"`),
    `<path d="M${num(bar.x + 14)} ${num(bar.y + 15)}h16M${num(bar.x + 14)} ${num(bar.y + 21)}h16M${num(bar.x + 14)} ${num(bar.y + 27)}h16" stroke="${c.ground}" stroke-width="2.5" stroke-linecap="round"/>`,
    rect({ x: bar.x + 44, y: bar.y + 17, w: bar.w - 44 - 40, h: 8 }, 4, `fill="${c.ground}"`),
    `<circle cx="${num(bar.x + bar.w - 20)}" cy="${num(bar.y + 21)}" r="8" fill="${c.ground}"/>`,
    rect(
      { x: bar.x - 6, y: bar.y - 6, w: bar.w + 12, h: bar.h + 12 },
      12,
      `fill="none" stroke="${c.flow}" stroke-width="2.5" stroke-dasharray="6 5"`,
    ),
    rect({ x: left + 14, y: y + 94, w: 96, h: 10 }, 5, `fill="${c.tint}"`),
    rect({ x: left + 14, y: y + 114, w: width - 44, h: 10 }, 5, `fill="${c.tint}"`),
    rect({ x: left + 14, y: y + 148, w: width - 28, h: h - 148 - 24 }, 10, `fill="${c.tint}"`),
  ]
  return bits.join('\n')
}

const layers = { group, card, arrow }
const order = ['group', 'card', 'arrow']

// ---------------------------------------------------------------------------
// Diagram descriptions
// ---------------------------------------------------------------------------

const processes = {
  name: 'processes',
  title: 'The processes of the workbench',
  description:
    'The designer edits the model folder, runs the start script, and opens the page. The start script starts one Node.js process that holds the host and the Vite development server. The host reads the model folder and sends each snapshot through the Vite development server to the page in the web browser.',
  width: 880,
  height: 472,
  items: [
    { kind: 'group', x: 257, y: 24, w: 334, h: 210, label: 'Node.js process' },
    { kind: 'group', x: 709, y: 24, w: 142, h: 210, label: 'Web browser' },

    { kind: 'card', x: 24, y: 68, w: 132, h: 150, title: 'Model folder', icon: 'folder' },
    { kind: 'card', x: 273, y: 68, w: 84, h: 150, title: 'Host', icon: 'server' },
    { kind: 'card', x: 417, y: 68, w: 158, h: 150, title: 'Vite', sub: 'development server', icon: 'bolt' },
    { kind: 'card', x: 725, y: 68, w: 110, h: 150, title: 'Page', icon: 'browser' },
    { kind: 'card', x: 24, y: 338, w: 132, h: 110, title: 'Designer', icon: 'person', variant: 'maker' },

    // The path of the data
    {
      kind: 'arrow',
      tone: 'flow',
      points: [
        [90, 338],
        [90, 218],
      ],
      label: { line: 'edits', at: [90, 278] },
    },
    {
      kind: 'arrow',
      tone: 'flow',
      points: [
        [156, 143],
        [273, 143],
      ],
      label: { line: 'files', at: [214.5, 143] },
    },
    {
      kind: 'arrow',
      tone: 'flow',
      points: [
        [357, 157],
        [417, 157],
      ],
    },
    {
      kind: 'arrow',
      tone: 'flow',
      points: [
        [575, 182],
        [725, 182],
      ],
      label: { line: 'snapshots', at: [650, 182] },
    },

    // The other connections of the Vite development server
    {
      kind: 'arrow',
      points: [
        [417, 129],
        [357, 129],
      ],
    },
    {
      kind: 'arrow',
      points: [
        [575, 104],
        [725, 104],
      ],
      label: { line: 'code', at: [650, 104] },
    },
    {
      kind: 'arrow',
      points: [
        [725, 143],
        [575, 143],
      ],
      label: { line: 'request', at: [650, 143] },
    },

    // The other actions of the designer
    {
      kind: 'arrow',
      points: [
        [156, 372],
        [496, 372],
        [496, 234],
      ],
      label: { line: 'start script', at: [306, 372] },
    },
    {
      kind: 'arrow',
      points: [
        [156, 414],
        [780, 414],
        [780, 218],
      ],
      label: { line: 'opens', at: [470, 414] },
    },
  ],
}

const picture = {
  name: 'picture',
  title: 'From a file to a picture',
  description:
    'The definition file and the state file go to the host, which makes a snapshot. The renderer takes the props from the snapshot and the view from the table of views. The table of views comes from the view file. The renderer draws the app bar in a marked element.',
  width: 880,
  height: 476,
  items: [
    // The model, then the snapshot
    { kind: 'card', x: 24, y: 24, w: 156, h: 90, title: 'Definition file', icon: 'file', iconSize: 32 },
    { kind: 'card', x: 24, y: 126, w: 156, h: 90, title: 'State file', icon: 'state', iconSize: 32 },
    { kind: 'card', x: 254, y: 24, w: 148, h: 192, title: 'Host', icon: 'server', iconSize: 52 },
    { kind: 'card', x: 476, y: 24, w: 128, h: 192, title: 'Snapshot', icon: 'snapshot', iconSize: 52 },

    // The views
    { kind: 'card', x: 24, y: 312, w: 156, h: 140, title: 'View file', icon: 'viewFile' },
    { kind: 'card', x: 254, y: 312, w: 148, h: 140, title: 'Table of views', icon: 'table' },
    { kind: 'card', x: 476, y: 312, w: 128, h: 140, title: 'Renderer', icon: 'wand' },

    // The picture
    {
      kind: 'card',
      x: 678,
      y: 24,
      w: 178,
      h: 428,
      variant: 'marked',
      shadow: false,
      title: 'Marked element',
      art: (c, item) => appBarPicture(c, { x: item.x, y: item.y + 24, w: item.w, h: item.h - 24 - 24 - 52 }),
    },

    // The path of the data
    {
      kind: 'arrow',
      tone: 'flow',
      points: [
        [180, 69],
        [254, 69],
      ],
    },
    {
      kind: 'arrow',
      tone: 'flow',
      points: [
        [180, 171],
        [254, 171],
      ],
    },
    {
      kind: 'arrow',
      tone: 'flow',
      points: [
        [402, 120],
        [476, 120],
      ],
    },
    {
      kind: 'arrow',
      tone: 'flow',
      points: [
        [540, 216],
        [540, 312],
      ],
      label: { line: 'props', at: [540, 264] },
    },
    {
      kind: 'arrow',
      tone: 'flow',
      points: [
        [604, 382],
        [678, 382],
      ],
    },

    // Where the view comes from
    {
      kind: 'arrow',
      points: [
        [180, 382],
        [254, 382],
      ],
    },
    {
      kind: 'arrow',
      points: [
        [402, 382],
        [476, 382],
      ],
    },
  ],
}

const diagrams = [processes, picture]

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const shadowFilter = (c) =>
  `<filter id="shadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="${c.night}" flood-opacity="0.12"/></filter>`

const renderDiagram = (diagram, theme, tokens) => {
  const c = { ...buildColors(tokens, theme), hasShadow: theme === 'light' }
  const body = order
    .flatMap((kind) => diagram.items.filter((item) => item.kind === kind))
    .map((item) => layers[item.kind](c, item))
    .join('\n')
  const { width, height } = diagram
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(width)} ${String(height)}" width="${String(width)}" height="${String(height)}" role="img" aria-labelledby="title desc">`,
    `<title id="title">${escapeXml(diagram.title)}</title>`,
    `<desc id="desc">${escapeXml(diagram.description)}</desc>`,
    c.hasShadow ? `<defs>${shadowFilter(c)}</defs>` : '',
    `<rect width="${String(width)}" height="${String(height)}" fill="${c.ground}"/>`,
    body,
    '</svg>',
    '',
  ]
    .filter((line) => line !== '')
    .join('\n')
}

const tokens = readTokens()

for (const diagram of diagrams) {
  for (const theme of ['light', 'dark']) {
    const file = join(here, `${diagram.name}-${theme}.svg`)
    writeFileSync(file, renderDiagram(diagram, theme, tokens))
    console.log(`wrote ${file}`)
  }
}
