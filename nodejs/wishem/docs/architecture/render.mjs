// Writes the SVG diagrams of the architecture documents.
// Usage: node render.mjs
// Each diagram is described once, below. The script writes one file for each theme.
// Colors come from the role tokens of the workbench. Text uses the standard typefaces of the system.
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
    chipFill: mix(c.surface, c.accentText, 0.12),
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
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"

// Width of a glyph as a share of the font size. The values assume a wide system font.
const WIDTH = { sans: 0.6, bold: 0.66, mono: 0.62, upper: 0.74 }

const escapeXml = (text) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

const num = (value) => String(Math.round(value * 100) / 100)

/** Splits a line on backticks. Odd parts are code. */
const parts = (line) =>
  line
    .split('`')
    .map((text, index) => ({ text, code: index % 2 === 1 }))
    .filter((part) => part.text !== '')

/** The size of code inside a line of text. */
const codeSize = (size) => Math.max(12, size - 1)

/** The estimated width of a line, for the overflow check. */
const textWidth = (line, { size, weight = 400, spacing = 0, upper = false }) =>
  parts(line).reduce((total, part) => {
    if (part.code) {
      return total + part.text.length * codeSize(size) * WIDTH.mono
    }
    const glyph =
      upper ? WIDTH.upper
      : weight >= 600 ? WIDTH.bold
      : WIDTH.sans
    return total + part.text.length * (size * glyph + spacing)
  }, 0)

/**
 * Draws one line of text. A part between backticks uses the monospace stack.
 * `maxWidth` is the width that the text must fit in.
 */
const text = (
  c,
  { x, y, line, size = 13, weight = 400, color = c.fg, anchor = 'start', spacing = 0, upper = false, maxWidth },
) => {
  if (maxWidth !== undefined && textWidth(line, { size, weight, spacing, upper }) > maxWidth) {
    throw new Error(`The text does not fit in ${String(maxWidth)} px: ${line}`)
  }
  const inner = parts(line)
    .map((part) =>
      part.code ?
        `<tspan font-family="${MONO}" font-weight="400" font-size="${num(codeSize(size))}" fill="${c.fg}">${escapeXml(part.text)}</tspan>`
      : escapeXml(upper ? part.text.toUpperCase() : part.text),
    )
    .join('')
  const extra = spacing === 0 ? '' : ` letter-spacing="${num(spacing)}"`
  return `<text x="${num(x)}" y="${num(y)}" font-family="${SANS}" font-weight="${String(weight)}" font-size="${num(size)}" fill="${color}" text-anchor="${anchor}"${extra}>${inner}</text>`
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

const PAD = 16
const CHIP_HEIGHT = 24
const CHIP_GAP = 6
const LINE_HEIGHT = 20
const FIRST_LINE = 55

const rect = ({ x, y, w, h }, radius, attributes) =>
  `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" rx="${num(radius)}" ${attributes}/>`

/** A tinted, round container with a small uppercase label. */
const group = (c, item) =>
  [
    rect(item, 18, `fill="${c.groupFill}" stroke="${c.line}"`),
    text(c, {
      x: item.x + 20,
      y: item.y + 30,
      line: item.label,
      size: 12,
      weight: 600,
      color: c.accentText,
      spacing: 1.2,
      upper: true,
      maxWidth: item.w - 40,
    }),
  ].join('\n')

/** Splits chips into rows that fit in `width`. A chip is a name in code. */
const chipRows = (chips, width, plain) => {
  const rows = [[]]
  let used = 0
  for (const chip of chips) {
    const w = textWidth(plain ? chip : `\`${chip}\``, { size: 13 }) + 16
    if (w > width) {
      throw new Error(`The chip does not fit in ${String(width)} px: ${chip}`)
    }
    if (used + w > width && rows[rows.length - 1].length > 0) {
      rows.push([])
      used = 0
    }
    rows[rows.length - 1].push({ chip, w })
    used += w + CHIP_GAP
  }
  return rows
}

/**
 * A card: a title, up to a few lines, chips, and an optional block of code.
 * `variant` is `plain`, `maker` (filled with the accent), or `marked` (outlined with the accent).
 */
const card = (c, item) => {
  const { x, y, w, h, variant = 'plain', lines = [], chips = [], code = [] } = item
  const inner = (item.textWidth ?? w) - 2 * PAD
  const fill = { plain: c.surface, maker: c.maker, marked: c.markedFill }[variant]
  const stroke =
    variant === 'maker' ? 'none'
    : variant === 'marked' ? `${c.flow}" stroke-width="1.5`
    : c.border
  const out = [
    rect(item, 12, `fill="${fill}" stroke="${stroke}"${item.shadow === false ? '' : ' filter="url(#shadow)"'}`),
  ]
  if (variant === 'maker') {
    out.push(
      text(c, {
        x: x + w / 2,
        y: y + h / 2 + 6,
        line: item.title,
        size: 18,
        weight: 600,
        color: c.night,
        anchor: 'middle',
        maxWidth: inner,
      }),
    )
    return out.join('\n')
  }
  out.push(text(c, { x: x + PAD, y: y + 32, line: item.title, size: 16, weight: 600, maxWidth: inner }))
  let bottom = y + 32
  lines.forEach((line, index) => {
    bottom = y + FIRST_LINE + index * LINE_HEIGHT
    out.push(text(c, { x: x + PAD, y: bottom, line, color: c.fgMuted, maxWidth: inner }))
  })
  if (chips.length > 0) {
    const chipTop = bottom + 12
    chipRows(chips, inner, item.plainChips === true).forEach((row, rowIndex) => {
      let chipX = x + PAD
      const chipY = chipTop + rowIndex * (CHIP_HEIGHT + CHIP_GAP)
      for (const { chip, w: chipWidth } of row) {
        out.push(
          rect(
            { x: chipX, y: chipY, w: chipWidth, h: CHIP_HEIGHT },
            item.plainChips === true ? 12 : 7,
            `fill="${c.chipFill}"`,
          ),
          text(c, { x: chipX + 8, y: chipY + 16.5, line: item.plainChips === true ? chip : `\`${chip}\``, size: 13 }),
        )
        chipX += chipWidth + CHIP_GAP
      }
      bottom = chipY + CHIP_HEIGHT - 12
    })
  }
  if (code.length > 0) {
    const width = Math.max(...code.map((line) => textWidth(`\`${line}\``, { size: 13 }))) + 24
    const top = bottom + 14
    if (width > inner) {
      throw new Error(`The code block does not fit in ${String(inner)} px: ${code[0]}`)
    }
    out.push(
      rect({ x: x + PAD, y: top, w: width, h: code.length * 20 + 16 }, 8, `fill="${c.ground}" stroke="${c.line}"`),
    )
    code.forEach((line, index) => {
      out.push(text(c, { x: x + PAD + 12, y: top + 24 + index * 20, line: `\`${line}\``, size: 13 }))
    })
    bottom = top + code.length * 20 + 16 - 16
  }
  if (bottom + PAD > y + h) {
    throw new Error(`The content of the card is higher than ${String(h)} px: ${item.title}`)
  }
  return out.join('\n')
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
 * An arrow along `points` with a head at the last point. A label sits on a chip at `label.at`.
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
    `<path d="${roundedPath(points, [baseX + ux * 1, baseY + uy * 1])}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<polygon points="${head}" fill="${stroke}" stroke="${stroke}" stroke-width="1" stroke-linejoin="round"/>`,
  ]
  if (item.label !== undefined) {
    const { line, at, maxWidth } = item.label
    const width = textWidth(line, { size: 12 }) + 22
    if (maxWidth !== undefined && width > maxWidth) {
      throw new Error(`The label does not fit in ${String(maxWidth)} px: ${line}`)
    }
    out.push(
      rect(
        { x: at[0] - width / 2, y: at[1] - 12, w: width, h: 24 },
        12,
        `fill="${c.surface}" stroke="${stroke}" stroke-opacity="0.55"`,
      ),
      text(c, {
        x: at[0],
        y: at[1] + 4.5,
        line,
        size: 12,
        weight: 500,
        color: item.tone === 'flow' ? c.flow : c.fgMuted,
        anchor: 'middle',
      }),
    )
  }
  return out.join('\n')
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
    'The designer runs the start script, which starts the host and the Vite development server in one Node.js process. The page in the web browser gets its code and its snapshots from the Vite development server. The host reads and watches the model folder. The designer edits the model folder by hand.',
  width: 880,
  height: 552,
  items: [
    { kind: 'group', x: 24, y: 24, w: 288, h: 208, label: 'Web browser' },
    { kind: 'group', x: 536, y: 24, w: 320, h: 360, label: 'One Node.js process' },

    {
      kind: 'card',
      x: 44,
      y: 68,
      w: 248,
      h: 140,
      title: 'Page',
      lines: ['Draws the app bar.'],
      chips: ['client of the core', 'renderer', 'AppBar view'],
      plainChips: true,
    },
    {
      kind: 'card',
      x: 556,
      y: 68,
      w: 280,
      h: 140,
      title: 'Vite development server',
      lines: ['Serves the page and the views.', 'Passes these to the host:'],
      chips: ['GET /snapshot', 'GET /snapshots'],
    },
    { kind: 'card', x: 556, y: 280, w: 280, h: 80, title: 'Host', lines: ['The core of the workbench.'] },
    {
      kind: 'card',
      x: 556,
      y: 444,
      w: 280,
      h: 84,
      title: 'Model folder',
      lines: ['Definitions and `state.json`.'],
    },
    { kind: 'card', x: 24, y: 444, w: 288, h: 84, title: 'Designer', variant: 'maker' },

    // The page and the Vite development server
    {
      kind: 'arrow',
      points: [
        [556, 100],
        [292, 100],
      ],
      label: { line: 'page code and view modules', at: [424, 100], maxWidth: 240 },
    },
    {
      kind: 'arrow',
      points: [
        [292, 138],
        [556, 138],
      ],
      label: { line: '`GET /snapshots`', at: [424, 138], maxWidth: 240 },
    },
    {
      kind: 'arrow',
      points: [
        [556, 176],
        [292, 176],
      ],
      label: { line: 'each snapshot', at: [424, 176], maxWidth: 240 },
    },

    // The Vite development server and the host
    {
      kind: 'arrow',
      points: [
        [616, 208],
        [616, 280],
      ],
      label: { line: 'passes the request', at: [616, 244], maxWidth: 160 },
    },
    {
      kind: 'arrow',
      points: [
        [776, 280],
        [776, 208],
      ],
      label: { line: 'each snapshot', at: [776, 244], maxWidth: 120 },
    },

    // The host and the model folder
    {
      kind: 'arrow',
      points: [
        [696, 360],
        [696, 444],
      ],
      label: { line: 'reads and watches', at: [696, 402], maxWidth: 160 },
    },

    // The actions of the designer
    {
      kind: 'arrow',
      tone: 'flow',
      points: [
        [168, 444],
        [168, 208],
      ],
      label: { line: 'opens the address of the page', at: [168, 320], maxWidth: 240 },
    },
    {
      kind: 'arrow',
      tone: 'flow',
      points: [
        [250, 444],
        [250, 372],
        [536, 372],
      ],
      label: { line: 'runs and stops the start script', at: [396, 372], maxWidth: 250 },
    },
    {
      kind: 'arrow',
      tone: 'flow',
      points: [
        [312, 486],
        [556, 486],
      ],
      label: { line: 'edits by hand', at: [434, 486], maxWidth: 140 },
    },
  ],
}

const picture = {
  name: 'picture',
  title: 'From a file to a picture',
  description:
    'The host reads the definition file and the state file and makes a snapshot. The client of the core in the page receives the snapshot. The renderer takes the view of each component type from the table of views, gives the props to the view, and draws the result in a marked element.',
  width: 880,
  height: 644,
  items: [
    // The model, left to right
    {
      kind: 'card',
      x: 24,
      y: 24,
      w: 252,
      h: 72,
      title: 'Definition file',
      lines: ['`definitions/ct_….json`'],
    },
    { kind: 'card', x: 24, y: 108, w: 252, h: 72, title: 'State file', lines: ['`state.json`'] },
    {
      kind: 'card',
      x: 314,
      y: 24,
      w: 252,
      h: 156,
      title: 'Host',
      lines: ['Reads the two files.'],
      chips: ['readModelFolder', 'validateModel', 'createCore'],
    },
    {
      kind: 'card',
      x: 604,
      y: 24,
      w: 252,
      h: 156,
      title: 'Snapshot',
      lines: ['The definitions and the', 'entities. Sent again after', 'each change.'],
      chips: ['getSnapshot'],
    },
    {
      kind: 'arrow',
      tone: 'flow',
      points: [
        [276, 60],
        [314, 60],
      ],
    },
    {
      kind: 'arrow',
      tone: 'flow',
      points: [
        [276, 144],
        [314, 144],
      ],
    },
    {
      kind: 'arrow',
      tone: 'flow',
      points: [
        [566, 102],
        [604, 102],
      ],
    },

    // The views and the client of the core
    {
      kind: 'card',
      x: 24,
      y: 240,
      w: 252,
      h: 148,
      title: 'View file',
      lines: ['`defineView` gives the', 'type ID, the props, and', '`render`.'],
      chips: ['src/views/AppBar.tsx'],
    },
    {
      kind: 'card',
      x: 314,
      y: 240,
      w: 252,
      h: 148,
      title: 'Table of views',
      lines: ['A table from component type', 'ID to view. `collectViews`', 'reads `src/views/*.tsx`.'],
    },
    {
      kind: 'card',
      x: 604,
      y: 240,
      w: 252,
      h: 148,
      title: 'Client of the core',
      lines: ['`connect()` opens the stream', 'of snapshots. It gives', '`getSnapshot` and `subscribe`.'],
    },
    {
      kind: 'arrow',
      points: [
        [276, 314],
        [314, 314],
      ],
    },
    {
      kind: 'arrow',
      tone: 'flow',
      points: [
        [730, 180],
        [730, 240],
      ],
      label: { line: '`GET /snapshots` through Vite', at: [730, 210], maxWidth: 240 },
    },

    // The renderer and the marked element
    {
      kind: 'card',
      x: 24,
      y: 448,
      w: 832,
      h: 172,
      textWidth: 300,
      title: 'Renderer',
      lines: [
        'For each entity and component',
        'type that has a view: takes each',
        'prop by field ID and calls',
        '`render`.',
      ],
    },
    {
      kind: 'card',
      x: 380,
      y: 464,
      w: 460,
      h: 140,
      shadow: false,
      variant: 'marked',
      title: 'Marked element',
      lines: ['Wraps the picture of the view: the app bar.'],
      code: ['<div data-wishem-entity="e_…"', 'data-wishem-component-type="ct_…">'],
    },
    {
      kind: 'arrow',
      tone: 'flow',
      points: [
        [324, 534],
        [380, 534],
      ],
    },
    {
      kind: 'arrow',
      points: [
        [440, 388],
        [440, 448],
      ],
      label: { line: 'the view of each component type', at: [440, 418], maxWidth: 260 },
    },
    {
      kind: 'arrow',
      tone: 'flow',
      points: [
        [730, 388],
        [730, 448],
      ],
      label: { line: 'the snapshot', at: [730, 418], maxWidth: 150 },
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
  const c = buildColors(tokens, theme)
  const body = order
    .flatMap((kind) => diagram.items.filter((item) => item.kind === kind))
    .map((item) => layers[item.kind](c, item))
    .join('\n')
  const { width, height } = diagram
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(width)} ${String(height)}" width="${String(width)}" height="${String(height)}" role="img" aria-labelledby="title desc">`,
    `<title id="title">${escapeXml(diagram.title)}</title>`,
    `<desc id="desc">${escapeXml(diagram.description)}</desc>`,
    theme === 'light' ? `<defs>${shadowFilter(c)}</defs>` : '',
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
