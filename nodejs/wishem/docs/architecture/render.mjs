// Writes the SVG diagrams of the architecture documents.
// Usage: node render.mjs [--check] [--packages <folder>] [--out <folder>]
// Each diagram is described once, below. The script writes one file for each theme.
// Colors come from the role tokens of the workbench. Text uses the standard typeface of the system.
// The script writes C4 diagrams, an entity diagram, and the package dependency view (docs/diagrams.md).
// The package dependency view comes from the package.json files of the packages and from the layers below.
// The script fails, and writes no file, when the packages disagree with the layers or with the table of the packages.
// With --check, the script writes no file. It fails when a file on the disk is not current.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const here = import.meta.dirname
const tokensFile = join(here, '..', '..', 'workbench-app', 'src', 'styles', 'tokens.css')

const { values: options } = parseArgs({
  options: {
    check: { type: 'boolean', default: false },
    packages: { type: 'string', default: join(here, '..', '..') },
    out: { type: 'string', default: here },
  },
})
const packagesFolder = resolve(options.packages)
const outFolder = resolve(options.out)

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
    border: mix(c.line, c.fgMuted, 0.2),
    componentBorder: mix(c.line, c.accentText, 0.6),
    flow: c.makerText,
    quiet: c.controlBorder,
    uses: c.fgMuted,
  }
}

// ---------------------------------------------------------------------------
// Text: the one place that decides how text is drawn
// ---------------------------------------------------------------------------

// The three text sizes of a diagram.
const SIZE = { title: 18, name: 15, detail: 12 }

const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

// Width of a glyph as a share of the font size. The values assume a wide system font.
const WIDTH = { regular: 0.6, bold: 0.62 }

const escapeXml = (value) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

const num = (value) => String(Math.round(value * 100) / 100)

/** The estimated width of a line, for the overflow check. */
const textWidth = (line, { size, weight = 400 }) => line.length * size * (weight >= 600 ? WIDTH.bold : WIDTH.regular)

/** Draws one line of text. `maxWidth` is the width that the text must fit in. */
const text = (c, { x, y, line, size = SIZE.detail, weight = 400, color = c.fg, anchor = 'start', maxWidth }) => {
  if (maxWidth !== undefined && textWidth(line, { size, weight }) > maxWidth) {
    throw new Error(`The text does not fit in ${String(maxWidth)} px: ${line}`)
  }
  return `<text x="${num(x)}" y="${num(y)}" font-family="${SANS}" font-weight="${String(weight)}" font-size="${num(size)}" fill="${color}" text-anchor="${anchor}">${escapeXml(line)}</text>`
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

const PAD = 8
const PERSON_ICON = '<circle cx="20" cy="12" r="6.5"/><path d="M7 35c0-8 6-12 13-12s13 4 13 12"/>'

const rect = ({ x, y, w, h }, radius, attributes) =>
  `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" rx="${num(radius)}" ${attributes}/>`

/** The path of a store: a cylinder. */
const cylinder = ({ x, y, w, h }, ry) => {
  const rx = w / 2
  return `M${num(x)} ${num(y + ry)} a${num(rx)} ${num(ry)} 0 0 1 ${num(w)} 0 v${num(h - 2 * ry)} a${num(rx)} ${num(ry)} 0 0 1 ${num(-w)} 0 z`
}

/** The label of a boundary: the name and the type, for example `Wishem [Software System]`. */
const group = (c, item) =>
  [
    rect(item, 14, `fill="${c.groupFill}" stroke="${c.border}" stroke-width="1.5" stroke-dasharray="7 5"`),
    text(c, {
      x: item.x + 16,
      y: item.y + 26,
      line: item.label,
      size: SIZE.detail,
      weight: 600,
      color: c.fgMuted,
      maxWidth: item.w - 32,
    }),
  ].join('\n')

/** Fill and stroke of each element shape. `focus` marks the element that the diagram is about. */
const shapeStyle = (c, shape, focus) => {
  if (focus) {
    return { fill: c.maker, stroke: 'none', ink: c.night, muted: c.night }
  }
  const fill = shape === 'person' ? c.tint : c.surface
  const stroke = shape === 'component' ? c.componentBorder : c.border
  return { fill, stroke, ink: c.fg, muted: c.fgMuted }
}

// Space of a line in an element card, and the height of a store top.
const LEAD = { name: 21, type: 18, description: 16 }
const ICON_SIZE = 28
const STORE_RY = 8
const DESCRIPTION_LINES = 2

/** Breaks a line of description into at most `maxLines` lines that fit `maxWidth`. */
const wrap = (line, maxWidth, maxLines) => {
  const lines = []
  let current = ''
  for (const word of line.split(' ')) {
    const next = current === '' ? word : `${current} ${word}`
    if (current !== '' && textWidth(next, { size: SIZE.detail }) > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  lines.push(current)
  if (lines.length > maxLines) {
    throw new Error(`The description needs ${String(lines.length)} lines, more than ${String(maxLines)}: ${line}`)
  }
  return lines
}

/**
 * An element: a name, a type and technology in brackets, and an optional description.
 * `shape` is `person`, `system`, `container`, `store`, or `component`.
 */
const element = (c, item) => {
  const { x, y, w, h, shape, name, type, description, pkg, focus = false } = item
  const style = shapeStyle(c, shape, focus)
  const attributes = `fill="${style.fill}" stroke="${style.stroke}" filter="url(#shadow)"`
  const out = [shape === 'store' ? `<path d="${cylinder(item, STORE_RY)}" ${attributes}/>` : rect(item, 14, attributes)]
  if (shape === 'store') {
    out.push(
      `<path d="M${num(x)} ${num(y + STORE_RY)} a${num(w / 2)} ${num(STORE_RY)} 0 0 0 ${num(w)} 0" fill="none" stroke="${style.stroke === 'none' ? c.night : style.stroke}"/>`,
    )
  }
  const inner = w - 2 * PAD
  const lines = [
    { line: name, size: SIZE.name, weight: 600, color: style.ink, lead: LEAD.name },
    { line: type, size: SIZE.detail, weight: 400, color: style.muted, lead: LEAD.type },
    ...(pkg === undefined ? [] : [{ line: pkg, size: SIZE.detail, weight: 400, color: style.muted, lead: LEAD.type }]),
    ...(description === undefined ? [] : wrap(description, inner, DESCRIPTION_LINES)).map((line) => ({
      line,
      size: SIZE.detail,
      weight: 400,
      color: style.muted,
      lead: LEAD.description,
    })),
  ]
  const iconBlock = shape === 'person' ? ICON_SIZE + 8 : 0
  const block = iconBlock + lines.reduce((sum, line) => sum + line.lead, 0)
  const areaTop = shape === 'store' ? y + 2 * STORE_RY : y
  const area = shape === 'store' ? h - 3 * STORE_RY : h
  if (block > area - 8) {
    throw new Error(`The text of ${name} is ${String(block)} px high and does not fit in ${String(area - 8)} px`)
  }
  let cursor = areaTop + (area - block) / 2
  if (shape === 'person') {
    const scale = ICON_SIZE / 40
    out.push(
      `<g transform="translate(${num(x + (w - ICON_SIZE) / 2)} ${num(cursor)}) scale(${num(scale)})" fill="none" stroke="${focus ? c.night : c.accentText}" stroke-width="${num(2 / scale)}" stroke-linecap="round" stroke-linejoin="round">${PERSON_ICON}</g>`,
    )
    cursor += iconBlock
  }
  for (const { lead, ...line } of lines) {
    out.push(text(c, { ...line, x: x + w / 2, y: cursor + lead - 5, anchor: 'middle', maxWidth: inner }))
    cursor += lead
  }
  return out.join('\n')
}

// Least visible line, in px, of an arrow. A labeled arrow keeps `MIN_SIDE` on each side of its chip.
const MIN_PLAIN = 56
const MIN_SIDE = 28
const CHIP_PAD = 22

/** The lines of a label: the lines that the label gives, or the verb phrase and the technology in brackets. */
const labelLines = (label) => {
  if (label.includes('\n')) {
    return label.split('\n')
  }
  const split = label.indexOf(' [')
  return split === -1 ? [label] : [label.slice(0, split), label.slice(split + 1)]
}

/** The size of the chip of a label. */
const chipSize = (label) => ({
  w: Math.max(...labelLines(label).map((line) => textWidth(line, { size: SIZE.detail, weight: 500 }))) + CHIP_PAD,
  h: labelLines(label).length === 1 ? 24 : 10 + 15 * labelLines(label).length,
})

/** Fails the run when an arrow is too short to read, or when its chip leaves too little line. */
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
        const chip = chipSize(label.line)
        half = ay === by ? chip.w / 2 : chip.h / 2
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

/** The head of an arrow: a triangle with its tip at `tip`, pointing along the unit vector `(ux, uy)`. */
const arrowHead = ([tipX, tipY], ux, uy) => {
  const baseX = tipX - ux * HEAD_LENGTH
  const baseY = tipY - uy * HEAD_LENGTH
  return [
    [tipX, tipY],
    [baseX - uy * HEAD_HALF, baseY + ux * HEAD_HALF],
    [baseX + uy * HEAD_HALF, baseY - ux * HEAD_HALF],
  ]
    .map(([x, y]) => `${num(x)},${num(y)}`)
    .join(' ')
}

/**
 * A relationship: an arrow along `points` with a head at the last point.
 * The label (`label.line`) sits on a chip at `label.at`. A technology in brackets goes on a second line.
 * `tone` is `flow` (accent, the primary path) or `quiet` (neutral).
 */
const arrow = (c, item) => {
  const stroke = c[item.tone ?? 'quiet']
  const { points } = item
  const tip = points[points.length - 1]
  const [fromX, fromY] = points[points.length - 2]
  const length = Math.hypot(tip[0] - fromX, tip[1] - fromY)
  const ux = (tip[0] - fromX) / length
  const uy = (tip[1] - fromY) / length
  const out = [
    `<path d="${roundedPath(points, [tip[0] - ux * (HEAD_LENGTH - 1), tip[1] - uy * (HEAD_LENGTH - 1)])}" fill="none" stroke="${stroke}" stroke-width="${num(item.width ?? 2.5)}" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<polygon points="${arrowHead(tip, ux, uy)}" fill="${stroke}" stroke="${stroke}" stroke-width="1" stroke-linejoin="round"/>`,
  ]
  checkLength(item)
  if (item.label !== undefined) {
    const { line, at } = item.label
    const lines = labelLines(line)
    const chip = chipSize(line)
    const color = item.tone === 'flow' ? c.flow : c.fgMuted
    out.push(
      rect(
        { x: at[0] - chip.w / 2, y: at[1] - chip.h / 2, w: chip.w, h: chip.h },
        12,
        `fill="${c.surface}" stroke="${stroke}"`,
      ),
    )
    lines.forEach((part, index) => {
      out.push(
        text(c, {
          x: at[0],
          y: at[1] + 4.5 - ((lines.length - 1) * 15) / 2 + index * 15,
          line: part,
          weight: index === 0 ? 500 : 400,
          color,
          anchor: 'middle',
        }),
      )
    })
  }
  if (item.uses !== undefined) {
    const { from, to } = item.uses
    return [
      `<g class="uses" data-from="${escapeXml(from)}" data-to="${escapeXml(to)}">`,
      `<title>${escapeXml(from)} uses ${escapeXml(to)}</title>`,
      ...out,
      '</g>',
    ].join('\n')
  }
  return out.join('\n')
}

// ---------------------------------------------------------------------------
// Entities and cardinality
// ---------------------------------------------------------------------------

const ENTITY = { head: 36, row: 20, padX: 12, tag: 52 }
const MARK_HALF = 7
const MARK_STROKE = 2

/** An entity card: the name and the keys. A key has `tag` (`PK`, `FK`, or both) and `name`. */
const entity = (c, item) => {
  const { x, y, w, h, name, keys } = item
  if (ENTITY.head + keys.length * ENTITY.row + 8 > h) {
    throw new Error(`The keys of ${name} do not fit in a card of ${String(h)} px`)
  }
  const out = [
    rect(item, 12, `fill="${c.surface}" stroke="${c.border}" filter="url(#shadow)"`),
    text(c, {
      x: x + ENTITY.padX,
      y: y + 24,
      line: name,
      size: SIZE.name,
      weight: 600,
      maxWidth: w - 2 * ENTITY.padX,
    }),
    `<path d="M${num(x)} ${num(y + ENTITY.head)} h${num(w)}" stroke="${c.border}"/>`,
  ]
  keys.forEach((key, index) => {
    const baseline = y + ENTITY.head + 16 + index * ENTITY.row
    out.push(
      text(c, {
        x: x + ENTITY.padX,
        y: baseline,
        line: key.tag,
        weight: 600,
        color: c.accentText,
        maxWidth: ENTITY.tag - 6,
      }),
      text(c, {
        x: x + ENTITY.padX + ENTITY.tag,
        y: baseline,
        line: key.name,
        maxWidth: w - 2 * ENTITY.padX - ENTITY.tag,
      }),
    )
  })
  return out.join('\n')
}

/**
 * The cardinality mark at `p`. `(dx, dy)` is the unit vector from the card along the line.
 * `one` is exactly one (two bars). `many` is zero or more (a circle and a crow's foot).
 * `zero-or-one` is a circle and one bar.
 */
const cardinality = (c, [px, py], [dx, dy], kind) => {
  const at = (along, across) => [px + dx * along - dy * across, py + dy * along + dx * across]
  const stroke = `stroke="${c.quiet}" stroke-width="${String(MARK_STROKE)}" stroke-linecap="round"`
  const seg = ([ax, ay], [bx, by]) => `M${num(ax)} ${num(ay)} L${num(bx)} ${num(by)}`
  if (kind === 'one') {
    return `<path d="${[10, 16].map((along) => seg(at(along, -MARK_HALF), at(along, MARK_HALF))).join(' ')}" fill="none" ${stroke}/>`
  }
  if (kind === 'zero-or-one') {
    const [zx, zy] = at(20, 0)
    return [
      `<path d="${seg(at(10, -MARK_HALF), at(10, MARK_HALF))}" fill="none" ${stroke}/>`,
      `<circle cx="${num(zx)}" cy="${num(zy)}" r="4.5" fill="${c.ground}" ${stroke}/>`,
    ].join('\n')
  }
  const [cx, cy] = at(22, 0)
  return [
    `<path d="${[-MARK_HALF, 0, MARK_HALF].map((across) => seg(at(14, 0), at(0, across))).join(' ')}" fill="none" ${stroke}/>`,
    `<circle cx="${num(cx)}" cy="${num(cy)}" r="4.5" fill="${c.ground}" ${stroke}/>`,
  ].join('\n')
}

/**
 * A relationship between two entity cards: a straight line with a cardinality mark at each end.
 * The label (`label.line`) sits on a chip at `label.at`.
 */
const relationship = (c, item) => {
  const { from, to, label } = item
  checkLength({ points: [from, to], label })
  const length = Math.hypot(to[0] - from[0], to[1] - from[1])
  const ux = (to[0] - from[0]) / length
  const uy = (to[1] - from[1]) / length
  const out = [
    `<path d="M${num(from[0])} ${num(from[1])} L${num(to[0])} ${num(to[1])}" fill="none" stroke="${c.quiet}" stroke-width="${String(MARK_STROKE)}"/>`,
    cardinality(c, from, [ux, uy], item.fromMark),
    cardinality(c, to, [-ux, -uy], item.toMark),
  ]
  if (label !== undefined) {
    const chip = chipSize(label.line)
    const [ax, ay] = label.at
    out.push(
      rect(
        { x: ax - chip.w / 2, y: ay - chip.h / 2, w: chip.w, h: chip.h },
        12,
        `fill="${c.surface}" stroke="${c.quiet}"`,
      ),
      text(c, { x: ax, y: ay + 4.5, line: label.line, weight: 500, color: c.fgMuted, anchor: 'middle' }),
    )
  }
  return out.join('\n')
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

const SAMPLE_W = 26
const SAMPLE_H = 16
const LEGEND_H = 44

/** A small sample of a shape, a boundary, or a relationship. `cy` is the middle of the sample. */
const sample = (c, kind, x, cy) => {
  const box = { x, y: cy - SAMPLE_H / 2, w: SAMPLE_W, h: SAMPLE_H }
  if (kind === 'flow' || kind === 'quiet' || kind === 'uses') {
    const color = c[kind]
    return [
      `<path d="M${num(x)} ${num(cy)} L${num(x + SAMPLE_W - HEAD_LENGTH + 1)} ${num(cy)}" stroke="${color}" stroke-width="${kind === 'uses' ? '2' : '2.5'}" stroke-linecap="round"/>`,
      `<polygon points="${arrowHead([x + SAMPLE_W, cy], 1, 0)}" fill="${color}" stroke="${color}" stroke-width="1" stroke-linejoin="round"/>`,
    ].join('\n')
  }
  if (kind === 'band') {
    return rect(box, 5, `fill="${c.groupFill}" stroke="${c.border}" stroke-width="1.5"`)
  }
  if (kind === 'card') {
    return rect(box, 5, `fill="${c.surface}" stroke="${c.border}"`)
  }
  if (kind === 'boundary') {
    return rect(box, 5, `fill="${c.groupFill}" stroke="${c.border}" stroke-width="1.5" stroke-dasharray="4 3"`)
  }
  if (kind === 'store') {
    return [
      `<path d="${cylinder(box, 4)}" fill="${c.surface}" stroke="${c.border}"/>`,
      `<path d="M${num(x)} ${num(box.y + 4)} a${num(SAMPLE_W / 2)} 4 0 0 0 ${num(SAMPLE_W)} 0" fill="none" stroke="${c.border}"/>`,
    ].join('\n')
  }
  if (kind === 'one' || kind === 'many' || kind === 'zero-or-one') {
    return [
      `<path d="M${num(x)} ${num(cy)} L${num(x + SAMPLE_W)} ${num(cy)}" stroke="${c.quiet}" stroke-width="${String(MARK_STROKE)}"/>`,
      cardinality(c, [x + SAMPLE_W, cy], [-1, 0], kind),
    ].join('\n')
  }
  if (kind === 'pk' || kind === 'fk') {
    return text(c, { x, y: cy + 4.5, line: kind.toUpperCase(), weight: 600, color: c.accentText })
  }
  const style = shapeStyle(c, kind === 'focus' ? 'system' : kind, kind === 'focus')
  return rect(box, 5, `fill="${style.fill}" stroke="${style.stroke}"`)
}

/** The legend: a strip with one sample and one label for each shape, color, and line style that the diagram uses. */
const legend = (c, item) => {
  const { x, y, w, entries } = item
  const middle = y + LEGEND_H / 2
  const out = [rect({ x, y, w, h: LEGEND_H }, 12, `fill="${c.surface}" stroke="${c.border}"`)]
  let cursor = x + 16
  out.push(text(c, { x: cursor, y: middle + 4.5, line: 'Legend', weight: 600, color: c.accentText, maxWidth: 60 }))
  cursor += 16 + textWidth('Legend', { size: SIZE.detail, weight: 600 })
  for (const [kind, label] of entries) {
    const width = textWidth(label, { size: SIZE.detail })
    if (cursor + SAMPLE_W + 8 + width > x + w - 16) {
      throw new Error(`The legend does not fit in ${String(w)} px: ${label}`)
    }
    out.push(sample(c, kind, cursor, middle))
    out.push(text(c, { x: cursor + SAMPLE_W + 8, y: middle + 4.5, line: label, color: c.fgMuted }))
    cursor += SAMPLE_W + 8 + width + 18
  }
  return out.join('\n')
}

// ---------------------------------------------------------------------------
// Package dependency view: bands and cards
// ---------------------------------------------------------------------------

const BAND = { x: 24, w: 992, top: 64, pad: 14, spacing: 14 }
const GRID = { columns: 3, left: 124, cardW: 176, gutter: 96 }
const ROUTE = {
  portGap: 14,
  stagger: 4,
  trackGap: 12,
  trackClear: 6,
  channelPad: 28,
  laneGap: 11,
  portClear: 6,
  edge: 8,
}
const LABEL = { x: 16, w: 100, line: 16, top: 24 }
const LABEL_LINES_MAX = 6
const CARD_PAD = 8
const CARD_TOP = 14
const CARD_LINES_MAX = 8
const CARD_MIN_H = 56

/** A band: the tinted area of one layer. `labelLines` name the layer, in the column left of the cards. */
const band = (c, item) =>
  [
    rect(item, 14, `fill="${c.groupFill}" stroke="${c.border}" stroke-width="1.5"`),
    ...item.labelLines.map((line, index) =>
      text(c, {
        x: item.x + LABEL.x,
        y: item.y + LABEL.top + index * LABEL.line,
        line,
        size: SIZE.detail,
        weight: 600,
        color: c.fgMuted,
        maxWidth: LABEL.w,
      }),
    ),
  ].join('\n')

/** A package card: the name, then the lines of the lists of packages. */
const packageCard = (c, item) => {
  const { x, y, h, w, name, lines } = item
  const inner = w - 2 * CARD_PAD
  if (h < CARD_TOP + LEAD.name + lines.length * LEAD.description + 8) {
    throw new Error(`The card of ${name} does not fit in ${String(h)} px`)
  }
  const out = [
    rect(item, 12, `fill="${c.surface}" stroke="${c.border}" filter="url(#shadow)"`),
    text(c, {
      x: x + CARD_PAD,
      y: y + CARD_TOP + LEAD.name - 5,
      line: name,
      size: SIZE.name,
      weight: 600,
      maxWidth: inner,
    }),
  ]
  lines.forEach((line, index) => {
    out.push(
      text(c, {
        x: x + CARD_PAD,
        y: y + CARD_TOP + LEAD.name + (index + 1) * LEAD.description - 5,
        line,
        color: c.fgMuted,
        maxWidth: inner,
      }),
    )
  })
  return out.join('\n')
}

const layers = { group, band, card: packageCard, element, entity, arrow, relationship, legend }
const order = ['group', 'band', 'card', 'element', 'entity', 'arrow', 'relationship', 'legend']

// ---------------------------------------------------------------------------
// Diagram descriptions
// ---------------------------------------------------------------------------

const WIDTH_PX = 880
const CARD_W = 250
const CARD_H = 104
const LEFT = 48
const MIDDLE = 315
const RIGHT = 582

/** Builds an element of a diagram. */
const el = (shape, x, y, name, type, description, extra = {}) => ({
  kind: 'element',
  shape,
  x,
  y,
  w: CARD_W,
  h: CARD_H,
  name,
  type,
  description,
  ...extra,
})

// Points on the edge of an element. Without a coordinate, the point is the middle of the edge.
const top = (e, x = e.x + e.w / 2) => [x, e.y]
const bottom = (e, x = e.x + e.w / 2) => [x, e.y + e.h]
const left = (e, y = e.y + e.h / 2) => [e.x, y]
const right = (e, y = e.y + e.h / 2) => [e.x + e.w, y]

const rel = (tone, points, line, at) => ({ kind: 'arrow', tone, points, label: { line, at } })

const SYSTEM = 'Wishem [Software System]'

// System context: the person and the software system. Wishem connects to no external system.
const contextDesigner = el('person', LEFT, 72, 'Designer', '[Person]', 'Makes a product with the workbench.', {
  h: 200,
})
const contextWishem = el('system', RIGHT, 72, 'Wishem', '[Software System]', 'Holds a model and draws it.', {
  h: 200,
  focus: true,
})
const contextArrow = (y, line) => rel('quiet', [right(contextDesigner, y), left(contextWishem, y)], line, [440, y])

const context = {
  name: 'context',
  title: 'System context diagram: Wishem',
  description:
    'The designer is the one person who uses Wishem. The designer starts the workbench in a terminal, edits the model files in a text editor, and looks at the page in a web browser. Wishem connects to no external system.',
  width: WIDTH_PX,
  height: 372,
  items: [
    contextDesigner,
    contextWishem,
    contextArrow(108, 'Starts the workbench [terminal]'),
    contextArrow(172, 'Edits the model files [text editor]'),
    contextArrow(236, 'Looks at the page [web browser]'),
    {
      kind: 'legend',
      x: 24,
      y: 304,
      w: 832,
      entries: [
        ['person', 'Person'],
        ['focus', 'Software system'],
        ['quiet', 'Relationship'],
      ],
    },
  ],
}

// Containers: one column of the runtime units. Each arrow from the designer runs through the area on the right and
// enters the right edge of its unit. A deeper unit gets a line farther to the right and a higher start point, so that
// no two of these lines cross.
const COLUMN = 40
const UNIT_GAP = 70
const STORE_H = 128
const cDesigner = el('person', COLUMN, 64, 'Designer', '[Person]', 'Makes a product with the workbench.', {
  h: 124,
})

const cPage = el(
  'container',
  COLUMN,
  284,
  'Page',
  '[Container: React, web browser]',
  'Draws each component that has a view.',
  { pkg: 'Package: workbench-app' },
)
const cProcess = el(
  'container',
  COLUMN,
  538,
  'Workbench process',
  '[Container: Node.js]',
  'Runs the constructs and serves the page.',
  { pkg: 'Package: workbench-app' },
)
const cModel = el(
  'store',
  COLUMN,
  752,
  'Model folder',
  '[Container: JSON files]',
  'Holds the definitions and the authored state.',
  { h: STORE_H, pkg: 'Package: workbench' },
)
const cProduct = el(
  'store',
  COLUMN,
  cModel.y + STORE_H + UNIT_GAP,
  'Product model folder',
  '[Container: JSON files]',
  'Holds the model of the mounted product.',
  { h: STORE_H, pkg: 'Example: sample-product' },
)
const cPixiPage = el(
  'container',
  COLUMN,
  cProduct.y + STORE_H + UNIT_GAP,
  'PixiJS page',
  '[Container: PixiJS, web browser]',
  'Draws the PixiJS construct and sends the keys.',
  { pkg: 'Package: pixi-page' },
)
const cPixiProcess = el(
  'container',
  COLUMN,
  cPixiPage.y + CARD_H + 150,
  'PixiJS process',
  '[Container: Node.js]',
  'Runs the construct and serves the page.',
  { pkg: 'Package: pixi-page' },
)
const cGodotApp = el(
  'container',
  COLUMN,
  cPixiProcess.y + CARD_H + UNIT_GAP,
  'Godot application',
  '[Container: GDScript, Docker]',
  'Draws the construct and writes screenshots.',
  { pkg: 'Package: renderer-godot' },
)
const cGodotRunner = el(
  'container',
  COLUMN,
  cGodotApp.y + CARD_H + 150,
  'Godot runner',
  '[Container: Node.js]',
  'Starts Godot in Docker, carries the link.',
  { pkg: 'Package: renderer-godot' },
)
const cGodotProcess = el(
  'container',
  COLUMN,
  cGodotRunner.y + CARD_H + 110,
  'Godot process',
  '[Container: Node.js]',
  'Runs the construct with a clock.',
  { pkg: 'Package: renderer-godot' },
)

// The arrow k of the designer: it leaves the right edge of the designer at a height that depends on k, runs to a
// position that depends on k, and enters the right edge of `target` at `at`. The label sits in the middle of the last line.
const designerArrow = (k, tone, target, at, line) => {
  const x = 560 + 40 * k
  const y = 176 - 12 * k
  return rel(tone, [right(cDesigner, y), [x, y], [x, at], right(target, at)], line, [(x + CARD_W + COLUMN) / 2, at])
}

// A vertical arrow between two stacked units, at the horizontal position `x`.
const stacked = (tone, from, to, x, line) => {
  const [upper, lower] = from.y < to.y ? [from, to] : [to, from]
  const y = (upper.y + upper.h + lower.y) / 2
  return rel(tone, from === upper ? [bottom(from, x), top(to, x)] : [top(from, x), bottom(to, x)], line, [x, y])
}

const SKIP_X = 310
const UNITS_BOTTOM = cGodotProcess.y + CARD_H
const LEGEND_Y = UNITS_BOTTOM + 62

const containers = {
  name: 'containers',
  title: 'Container diagram: Wishem',
  description:
    'Wishem has nine containers. The designer starts the three processes and the Godot runner, edits the model folder and the product model folder, and looks at the two pages. The page gets page code over HTTP and connects to the hub over a WebSocket link through the workbench process. The workbench process reads, watches, and writes the two folders. The PixiJS page connects the same way to the PixiJS process. The Godot runner starts the Godot application in Docker and carries the link of the application over TCP to the Godot process.',
  width: WIDTH_PX,
  height: LEGEND_Y + LEGEND_H + 24,
  items: [
    { kind: 'group', x: 24, y: 212, w: 832, h: UNITS_BOTTOM + 30 - 212, label: SYSTEM },
    cDesigner,
    cPage,
    cProcess,
    cModel,
    cProduct,
    cPixiPage,
    cPixiProcess,
    cGodotApp,
    cGodotRunner,
    cGodotProcess,

    // The designer
    designerArrow(0, 'flow', cPage, 340, 'Looks at [web browser]'),
    designerArrow(1, 'quiet', cProcess, 590, 'Starts and stops [terminal]'),
    designerArrow(2, 'flow', cModel, 816, 'Edits files [text editor]'),
    designerArrow(3, 'quiet', cProduct, cProduct.y + 40, 'Edits files [text editor]'),
    designerArrow(4, 'flow', cPixiPage, cPixiPage.y + 40, 'Looks at and presses keys [web browser]'),
    designerArrow(5, 'quiet', cPixiProcess, cPixiProcess.y + 52, 'Starts and stops [terminal]'),
    designerArrow(6, 'quiet', cGodotRunner, cGodotRunner.y + 52, 'Starts and looks at the screenshots [terminal]'),
    designerArrow(7, 'quiet', cGodotProcess, cGodotProcess.y + 52, 'Starts and stops [terminal]'),

    // The workbench process
    stacked('quiet', cPage, cProcess, 100, 'Gets page code [HTTP]'),
    stacked('flow', cPage, cProcess, 250, 'Connects to the hub [WebSocket link]'),
    stacked('flow', cProcess, cModel, 165, 'Reads, watches, and writes [file system]'),
    rel(
      'quiet',
      [right(cProcess, 620), [SKIP_X, 620], [SKIP_X, cProduct.y + 90], right(cProduct, cProduct.y + 90)],
      'Reads, watches, and writes [file system]',
      [SKIP_X, (cModel.y + STORE_H + cProduct.y) / 2],
    ),

    // The PixiJS process
    stacked('quiet', cPixiPage, cPixiProcess, 100, 'Gets page code [HTTP]'),
    stacked('flow', cPixiPage, cPixiProcess, 250, 'Connects to the hub [WebSocket link]'),

    // The Godot application, the Godot runner, and the Godot process
    stacked('quiet', cGodotRunner, cGodotApp, 100, 'Starts and copies\nthe screenshots\n[Docker]'),
    stacked('flow', cGodotApp, cGodotRunner, 255, 'Connects to the hub [WebSocket link]'),
    stacked('quiet', cGodotRunner, cGodotProcess, 165, 'Carries the link [TCP]'),
    {
      kind: 'legend',
      x: 24,
      y: LEGEND_Y,
      w: 832,
      entries: [
        ['person', 'Person'],
        ['container', 'Container'],
        ['store', 'Store'],
        ['boundary', 'Boundary'],
        ['flow', 'Primary path'],
        ['quiet', 'Other relationship'],
      ],
    },
  ],
}

// Dynamic: the path of a change
const dDesigner = el('person', LEFT, 72, 'Designer', '[Person]')
const dModel = el('store', RIGHT, 72, 'Model folder', '[Container: JSON files]')
const dProcess = el('container', RIGHT, 272, 'Workbench process', '[Container: Node.js]')
const dPage = el('container', LEFT, 272, 'Page', '[Container: React, web browser]')

const dynamicChange = {
  name: 'dynamic-change',
  title: 'Dynamic diagram: a change to the model becomes a new picture',
  description:
    'Four steps in order. The designer saves a model file in the model folder. The workbench process reads after the watch event. The process sends the changed parts to the page over the WebSocket link. The page shows the new picture to the designer.',
  width: WIDTH_PX,
  height: 492,
  items: [
    dDesigner,
    dModel,
    dProcess,
    dPage,
    rel('flow', [right(dDesigner), left(dModel)], '1. Saves a model file', [440, 124]),
    rel('flow', [top(dProcess), bottom(dModel)], '2. Reads after the watch event', [707, 224]),
    rel('flow', [left(dProcess), right(dPage)], '3. Sends the changed parts [WebSocket link]', [440, 324]),
    rel('flow', [top(dPage), bottom(dDesigner)], '4. Shows the new picture', [173, 224]),
    {
      kind: 'legend',
      x: 24,
      y: 424,
      w: 832,
      entries: [
        ['person', 'Person'],
        ['container', 'Container'],
        ['store', 'Store'],
        ['flow', 'Step, in the order of the flow'],
      ],
    },
  ],
}

// Components of the page
const pProcess = el(
  'container',
  RIGHT,
  64,
  'Workbench process',
  '[Container: Node.js]',
  'Holds the construct and serves the page.',
)
const pSidecars = el(
  'component',
  LEFT,
  316,
  'Sidecars',
  '[Component: JSON files]',
  'Attach each view to a component type.',
)
const pClient = el(
  'component',
  RIGHT,
  316,
  'Client of the hub',
  '[Component: connectHub]',
  'Gives the output port and the input port of each link.',
)
const pTable = el(
  'component',
  LEFT,
  516,
  'Table of views',
  '[Component: renderer-react]',
  'Gives the view of a component type.',
)
const pRenderer = el(
  'component',
  RIGHT,
  516,
  'Renderer',
  '[Component: renderer-react]',
  'Draws each component in a marked element.',
)
const pViews = el('component', LEFT, 716, 'Views', '[Component: React]', 'Draw one component type each.')
const pCatalog = el('component', RIGHT, 716, 'Catalog', '[Component: React]', 'The app bar and the zero state.')

const componentsPage = {
  name: 'components-page',
  title: 'Component diagram: the page of the workbench',
  description:
    'The page has six components. The client of the hub connects to the workbench process through the link, with an output subsystem and an input subsystem. The renderer reads the part store from the output port and sends inputs through the input port. It finds the view in the table of views, and mounts it with props. A view sends an input through the prop wishem. The table collects the views and reads the sidecars. The views draw with the catalog.',
  width: WIDTH_PX,
  height: 940,
  items: [
    pProcess,
    { kind: 'group', x: 24, y: 244, w: 832, h: 600, label: 'Page [Container: React, web browser]' },
    pSidecars,
    pClient,
    pTable,
    pRenderer,
    pViews,
    pCatalog,

    // The path of the model to a view
    rel('flow', [top(pClient), bottom(pProcess)], 'Connects to the hub [WebSocket link]', [707, 216]),
    rel('flow', [top(pRenderer), bottom(pClient)], 'Reads and sends [ports]', [707, 468]),
    rel('flow', [bottom(pRenderer, 740), [740, 668], [250, 668], top(pViews, 250)], 'Mounts with props', [495, 668]),
    rel('flow', [right(pViews), left(pCatalog)], 'Draw with', [440, 768]),
    rel('flow', [top(pViews, 200), [200, 638], [620, 638], bottom(pRenderer, 620)], 'Send inputs [wishem]', [410, 638]),

    // How the table of views gets its content
    rel('flow', [left(pRenderer), right(pTable)], 'Finds the view', [440, 568]),
    rel('quiet', [top(pTable), bottom(pSidecars)], 'Reads', [173, 468]),
    rel('quiet', [bottom(pTable, 110), top(pViews, 110)], 'Collects', [110, 668]),
    {
      kind: 'legend',
      x: 24,
      y: 876,
      w: 832,
      entries: [
        ['container', 'Container'],
        ['component', 'Component'],
        ['boundary', 'Boundary'],
        ['flow', 'Primary path'],
        ['quiet', 'Other relationship'],
      ],
    },
  ],
}

// Components of the workbench process (`workbench-app/scripts/start.ts`)
const WP_ROW = (n) => 284 + 200 * (n - 1)
const wpComponent = (x, row, name, type, description, extra) =>
  el('component', x, WP_ROW(row), name, type, description, extra)

const wPage = el(
  'container',
  RIGHT,
  64,
  'Page',
  '[Container: React, web browser]',
  'Draws each component that has a view.',
)
const wVite = wpComponent(
  RIGHT,
  1,
  'Vite development server',
  '[Component: Vite]',
  'Serves the page code and passes the link.',
)
const wConstruct = wpComponent(
  RIGHT,
  2,
  'Workbench construct',
  '[Component: host-nodejs]',
  'The hub, the stores, and the construct list.',
)
const wGen = wpComponent(
  RIGHT,
  3,
  'Generator of the view types',
  '[Component: renderer-react]',
  'Writes the types of the props.',
  { w: 280, x: RIGHT + CARD_W - 280 },
)
const wStorage = wpComponent(
  RIGHT,
  4,
  'Storage subsystems',
  '[Component: host-nodejs]',
  'Read, watch, and write the model folders.',
)
const wStart = wpComponent(
  LEFT,
  1,
  'Start script',
  '[Component: workbench-app]',
  'Reads the options and starts each part.',
)
const wManager = wpComponent(
  LEFT,
  2,
  'Construct manager',
  '[Component: construct-manager]',
  'Starts and stops the product constructs.',
)
const wProducts = wpComponent(
  LEFT,
  3,
  'Product constructs',
  '[Component: construct-manager]',
  'A hub, a store, and a clock each, with a link.',
)
const wUpdate = wpComponent(LEFT, 4, 'Update subsystem', '[Component: update]', 'Runs the behaviors at each tick.')
const wCode = wpComponent(
  LEFT,
  5,
  'Product code',
  '[Component: dynamic import]',
  'The native behaviors of the product.',
)

const WP_GROUP_Y = 244
const WP_GROUP_BOTTOM = WP_ROW(5) + CARD_H + 30
const WP_FOLDER_Y = WP_GROUP_BOTTOM + 72
const WP_FOLDER_H = 112
const wModel = el(
  'store',
  RIGHT,
  WP_FOLDER_Y,
  'Model folder',
  '[Container: JSON files]',
  'Holds the definitions and state.json.',
  { h: WP_FOLDER_H },
)
const wProduct = el(
  'store',
  LEFT,
  WP_FOLDER_Y,
  'Product model folder',
  '[Container: JSON files]',
  'The model of the mounted product.',
  { h: WP_FOLDER_H },
)
const WP_LEGEND_Y = WP_FOLDER_Y + WP_FOLDER_H + 40
const WP_LANE = { construct: 440, code: 380, storage: 530 }
const WP_MID = (row) => WP_ROW(row) + CARD_H + 48

const componentsWorkbenchProcess = {
  name: 'components-workbench-process',
  title: 'Component diagram: the workbench process',
  description:
    'The workbench process has nine components. The start script loads the product code, starts the workbench construct and the Vite development server, and attaches the construct manager with the behaviors. The page gets page code from the Vite development server and connects to the hub through it. The Vite development server passes the link to the workbench construct. The storage subsystems read, watch, and write the model folder and the product model folder, and send the model to the workbench construct. The construct manager reads the product and the construct list from the workbench construct, and starts, stops, and updates the product constructs. Each product construct runs the behaviors with the update subsystem, which calls the product code. The generator of the view types reads the definitions from the workbench construct.',
  width: WIDTH_PX,
  height: WP_LEGEND_Y + LEGEND_H + 24,
  items: [
    wPage,
    {
      kind: 'group',
      x: 24,
      y: WP_GROUP_Y,
      w: 832,
      h: WP_GROUP_BOTTOM - WP_GROUP_Y,
      label: 'Workbench process [Container: Node.js]',
    },
    wVite,
    wConstruct,
    wGen,
    wStorage,
    wStart,
    wManager,
    wProducts,
    wUpdate,
    wCode,
    wModel,
    wProduct,

    // The path of the page to the construct
    rel('quiet', [bottom(wPage, 780), top(wVite, 780)], 'Gets page code [HTTP]', [780, 216]),
    rel('flow', [bottom(wPage, 630), top(wVite, 630)], 'Connects to the hub [WebSocket link]', [630, 216]),
    rel('flow', [bottom(wVite, 630), top(wConstruct, 630)], 'Passes the link [WebSocket]', [630, WP_MID(1)]),

    // The start script
    rel('quiet', [right(wStart, WP_ROW(1) + 26), left(wVite, WP_ROW(1) + 26)], 'Starts', [440, WP_ROW(1) + 26]),
    rel(
      'quiet',
      [
        right(wStart, WP_ROW(1) + 78),
        [WP_LANE.construct, WP_ROW(1) + 78],
        [WP_LANE.construct, WP_ROW(2) + 18],
        left(wConstruct, WP_ROW(2) + 18),
      ],
      'Starts',
      [WP_LANE.construct, WP_ROW(1) + 150],
    ),
    rel('quiet', [bottom(wStart, 173), top(wManager, 173)], 'Attaches with the behaviors', [173, WP_MID(1)]),
    rel(
      'quiet',
      [
        right(wStart, WP_ROW(1) + 52),
        [WP_LANE.code, WP_ROW(1) + 52],
        [WP_LANE.code, WP_ROW(5) + 52],
        right(wCode, WP_ROW(5) + 52),
      ],
      'Loads and checks [import()]',
      [WP_LANE.code, WP_ROW(4) + 52],
    ),

    // The construct manager and the product constructs
    rel('quiet', [right(wManager, WP_ROW(2) + 52), left(wConstruct, WP_ROW(2) + 52)], 'Reads and reports\n[port]', [
      480,
      WP_ROW(2) + 52,
    ]),
    rel('flow', [bottom(wManager, 173), top(wProducts, 173)], 'Starts, stops, and updates [port]', [173, WP_MID(2)]),
    rel('flow', [bottom(wProducts, 173), top(wUpdate, 173)], 'Runs the behaviors with', [173, WP_MID(3)]),
    rel('quiet', [bottom(wUpdate, 173), top(wCode, 173)], 'Calls', [173, WP_MID(4)]),

    // The storage subsystems and the generator
    rel('quiet', [top(wGen, 630), bottom(wConstruct, 630)], 'Reads the definitions [port]', [630, WP_MID(2)]),
    rel(
      'quiet',
      [
        left(wStorage, WP_ROW(4) + 52),
        [WP_LANE.storage, WP_ROW(4) + 52],
        [WP_LANE.storage, WP_ROW(2) + 86],
        left(wConstruct, WP_ROW(2) + 86),
      ],
      'Sends the model [port]',
      [WP_LANE.storage, WP_MID(3)],
    ),
    rel('quiet', [bottom(wStorage, 750), top(wModel, 750)], 'Reads, watches, and writes [file system]', [
      750,
      (WP_ROW(4) + CARD_H + WP_FOLDER_Y) / 2,
    ]),
    rel(
      'quiet',
      [bottom(wStorage, 610), [610, WP_GROUP_BOTTOM + 36], [230, WP_GROUP_BOTTOM + 36], top(wProduct, 230)],
      'Reads, watches, and writes [file system]',
      [420, WP_GROUP_BOTTOM + 36],
    ),
    {
      kind: 'legend',
      x: 24,
      y: WP_LEGEND_Y,
      w: 832,
      entries: [
        ['container', 'Container'],
        ['component', 'Component'],
        ['store', 'Store'],
        ['boundary', 'Boundary'],
        ['flow', 'Primary path'],
        ['quiet', 'Other relationship'],
      ],
    },
  ],
}

// Entities of the model folder (`core/src/model.ts`)
const ENTITY_W = 290
const ENTITY_LEFT = 48
const ENTITY_RIGHT = 542
const ROW_1 = 72
const ROW_2 = 252
const ROW_3 = 452

// Card heights: one key, and two or three keys.
const H_SHORT = 64
const H_MID = 84
const H_TALL = 104

const ent = (x, y, h, name, keys) => ({ kind: 'entity', x, y, w: ENTITY_W, h, name, keys })
const pk = (name) => ({ tag: 'PK', name })
const pkfk = (name) => ({ tag: 'PK, FK', name })

const eType = ent(ENTITY_LEFT, ROW_1, H_MID, 'ComponentTypeDefinition', [pk('id')])
const eField = ent(ENTITY_RIGHT, ROW_1, H_MID, 'FieldDefinition', [pkfk('ComponentTypeDefinition.id'), pk('id')])
const eComponent = ent(ENTITY_LEFT, ROW_2, H_TALL, 'Component', [pkfk('Entity.id'), pkfk('ComponentTypeDefinition.id')])
const eValue = ent(ENTITY_RIGHT, ROW_2, H_TALL, 'FieldValue', [
  pkfk('Entity.id'),
  pkfk('ComponentTypeDefinition.id'),
  pkfk('FieldDefinition.id'),
])
const eEntity = ent(ENTITY_LEFT, ROW_3, H_SHORT, 'Entity', [pk('id')])

// A relationship from point `from` to point `to`, with a mark at each end: `one`, `many`, or `zero-or-one`.
const link = (from, fromMark, to, toMark, label) => ({ kind: 'relationship', from, to, fromMark, toMark, label })

const entitiesModelFolder = {
  name: 'entities-model-folder',
  title: 'Entity diagram: the model folder',
  description:
    'The model folder has five entities. A component type has zero or more fields. An entity has zero or more components, and each component has one component type. A component has zero or more field values, and each field value has one field. A field value of the type reference has zero or one entity, and an entity has zero or more field values that refer to it.',
  width: WIDTH_PX,
  height: 632,
  items: [
    eType,
    eField,
    eComponent,
    eValue,
    eEntity,
    link(right(eType), 'one', left(eField), 'many'),
    link(bottom(eType), 'one', top(eComponent), 'many'),
    link(top(eEntity), 'one', bottom(eComponent), 'many'),
    link(right(eComponent), 'one', left(eValue), 'many'),
    link(bottom(eField), 'one', top(eValue), 'many'),
    link(bottom(eValue, 698), 'many', right(eEntity), 'zero-or-one', { line: 'Refers to', at: [518, 420] }),
    {
      kind: 'legend',
      x: 24,
      y: 564,
      w: 832,
      entries: [
        ['entity', 'Entity'],
        ['pk', 'Primary key'],
        ['fk', 'Foreign key'],
        ['one', 'One'],
        ['many', 'Zero or more'],
        ['zero-or-one', 'Zero or one'],
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Packages: the layers, the checks, and the package dependency view
// ---------------------------------------------------------------------------

// The layers, from the lowest to the highest. A runtime dependency goes to the same layer or a lower layer.
const packageLayers = [
  { name: 'Hub', packages: ['hub'] },
  { name: 'Model and subsystems', packages: ['core', 'clock', 'update'] },
  {
    name: 'Hosts, renderers, and products',
    packages: [
      'host-nodejs',
      'construct-manager',
      'renderer-react',
      'renderer-pixi',
      'renderer-godot',
      'sample-product',
    ],
  },
  { name: 'Applications', packages: ['workbench', 'workbench-app', 'pixi-page'] },
  { name: 'Checks', packages: ['docs-check'] },
]

const PACKAGE_PREFIX = '@thrashplay/wishem-'
const CHECK_PACKAGE = 'docs-check'
const TABLE_HEADING = '## Package dependency view: Wishem'

/** Reads each package of the folder: its folder name, its name field, and its Wishem dependencies. */
const readPackages = () =>
  readdirSync(packagesFolder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(packagesFolder, entry.name, 'package.json')))
    .map((entry) => entry.name)
    .sort()
    .map((folder) => {
      const manifest = JSON.parse(readFileSync(join(packagesFolder, folder, 'package.json'), 'utf8'))
      const wishemNames = (record) =>
        Object.keys(record ?? {})
          .filter((name) => name.startsWith(PACKAGE_PREFIX))
          .map((name) => name.slice(PACKAGE_PREFIX.length))
      const uses = [
        ...new Set([...wishemNames(manifest.dependencies), ...wishemNames(manifest.peerDependencies)]),
      ].sort()
      const tests = wishemNames(manifest.devDependencies)
        .filter((name) => !uses.includes(name))
        .sort()
      return { folder, name: manifest.name, uses, tests, devDependencies: wishemNames(manifest.devDependencies) }
    })

/** Reads the short names of the packages in the first table after the heading of the view in `README.md`. */
const readTableRows = () => {
  const file = join(outFolder, 'README.md')
  if (!existsSync(file)) {
    return new Set()
  }
  const lines = readFileSync(file, 'utf8').split('\n')
  const start = lines.findIndex((line) => line.trim() === TABLE_HEADING)
  const rows = new Set()
  if (start === -1) {
    return rows
  }
  let inTable = false
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('|')) {
      inTable = true
      const first = /^\|\s*`([^`]+)`\s*\|/.exec(line)
      if (first) {
        rows.add(first[1])
      }
    } else if (inTable) {
      break
    }
  }
  return rows
}

/** The rank of each package of one layer: 1 plus the highest rank of the packages of the layer that it uses. */
const rankLayer = (names, byName) => {
  const rank = new Map()
  let pending = names
  while (pending.length > 0) {
    const inLayer = (name) => byName.get(name).uses.filter((use) => names.includes(use))
    const ready = pending.filter((name) => inLayer(name).every((use) => rank.has(use)))
    if (ready.length === 0) {
      return undefined
    }
    for (const name of ready) {
      rank.set(name, 1 + Math.max(0, ...inLayer(name).map((use) => rank.get(use))))
    }
    pending = pending.filter((name) => !rank.has(name))
  }
  return rank
}

/** Finds each disagreement between the packages, the layers, and the table of the packages. */
const checkPackages = (packages) => {
  const problems = []
  const known = new Set(packages.map((pkg) => pkg.folder))
  const layerOf = new Map()
  const doubled = new Set()
  packageLayers.forEach((layer, index) => {
    for (const name of layer.packages) {
      if (!known.has(name)) {
        problems.push(`render: the layer "${layer.name}" names ${name}, which is not a package`)
      } else if (layerOf.has(name)) {
        doubled.add(name)
      } else {
        layerOf.set(name, index)
      }
    }
  })
  const rows = readTableRows()
  const checker = packages.find((pkg) => pkg.folder === CHECK_PACKAGE)
  for (const pkg of packages) {
    if (pkg.name !== `${PACKAGE_PREFIX}${pkg.folder}`) {
      problems.push(`render: the folder ${pkg.folder} holds the package ${String(pkg.name)}`)
    }
    if (doubled.has(pkg.folder)) {
      problems.push(`render: the package ${pkg.folder} is in two layers`)
    } else if (!layerOf.has(pkg.folder)) {
      problems.push(`render: the package ${pkg.folder} has no layer`)
    }
    for (const used of pkg.uses) {
      if (layerOf.has(pkg.folder) && layerOf.has(used) && layerOf.get(used) > layerOf.get(pkg.folder)) {
        problems.push(
          `render: ${pkg.folder} (layer "${packageLayers[layerOf.get(pkg.folder)].name}") uses ${used} (layer "${packageLayers[layerOf.get(used)].name}"), which is a higher layer`,
        )
      }
    }
    if (!rows.has(pkg.folder)) {
      problems.push(`render: the table of the packages has no row for ${pkg.folder}`)
    }
    if (checker !== undefined && pkg !== checker && !checker.devDependencies.includes(pkg.folder)) {
      problems.push(`render: ${pkg.folder} is not a development dependency of ${CHECK_PACKAGE}`)
    }
  }
  const byName = new Map(packages.map((pkg) => [pkg.folder, pkg]))
  packageLayers.forEach((layer, index) => {
    const members = packages.filter((pkg) => layerOf.get(pkg.folder) === index).map((pkg) => pkg.folder)
    if (rankLayer(members, byName) === undefined) {
      problems.push(`render: the packages of the layer "${layer.name}" use one another in a cycle`)
    }
  })
  return { problems, layerOf }
}

/** The lines of a card below its name: the packages that it tests with. */
const cardLines = (pkg, packages) => {
  const inner = GRID.cardW - 2 * CARD_PAD
  if (pkg.tests.length === 0) {
    return []
  }
  const others = packages.filter((other) => other !== pkg)
  const all = others.every((other) => pkg.tests.includes(other.folder))
  return wrap(all ? 'Tests with: each other package' : `Tests with: ${pkg.tests.join(', ')}`, inner, CARD_LINES_MAX)
}

/** The lines of the label of a layer band. */
const bandLabel = (layerIndex) =>
  wrap(`Layer ${String(layerIndex + 1)}: ${packageLayers[layerIndex].name}`, LABEL.w - 6, LABEL_LINES_MAX)

// ---------------------------------------------------------------------------
// Package dependency view: the grid, the ports, the lanes, the tracks, and the checks of the routes
// ---------------------------------------------------------------------------

const colX = (column) => BAND.x + GRID.left + column * (GRID.cardW + GRID.gutter)

/** The rows of the cards from the highest to the lowest: one row for each chunk of three packages of one rank. */
const arrangeRows = (packages, layerOf) => {
  const byName = new Map(packages.map((pkg) => [pkg.folder, pkg]))
  const column = new Map()
  const rows = []
  packageLayers.forEach((layer, index) => {
    const members = packages.filter((pkg) => layerOf.get(pkg.folder) === index).map((pkg) => pkg.folder)
    const rank = rankLayer(members, byName)
    for (let level = 1; level <= Math.max(0, ...rank.values()); level++) {
      const mean = (name) => {
        const used = byName
          .get(name)
          .uses.map((other) => column.get(other))
          .filter((value) => value !== undefined)
        return used.length === 0 ? 1 : used.reduce((sum, value) => sum + value, 0) / used.length
      }
      const group = members
        .filter((name) => rank.get(name) === level)
        .sort((a, b) => mean(a) - mean(b) || a.localeCompare(b))
      for (let start = 0; start < group.length; start += GRID.columns) {
        const free = Array.from({ length: GRID.columns }, (_, value) => value)
        for (const name of group.slice(start, start + GRID.columns)) {
          const target = mean(name)
          free.sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b)
          column.set(name, free.shift())
        }
        rows.push({ layer: index, names: group.slice(start, start + GRID.columns) })
      }
    }
  })
  return { rows: rows.reverse(), column }
}

// The two ends of a route. A route goes from the first (above) to the second (below).
const arrowEnds = (edge) => [edge.from, edge.to]

const cardRects = (cards) => cards

/** The box of the label of a band, with a margin. */
const labelBox = (item) => ({
  x: item.x + LABEL.x - 3,
  y: item.y + LABEL.top - 14,
  w: LABEL.w + 6,
  h: item.labelLines.length * LABEL.line + 6,
})

const hitsBox = ([[ax, ay], [bx, by]], box, margin = 0.5) =>
  Math.min(ax, bx) < box.x + box.w - margin &&
  Math.max(ax, bx) > box.x + margin &&
  Math.min(ay, by) < box.y + box.h - margin &&
  Math.max(ay, by) > box.y + margin

const segmentsOf = (points) => points.slice(1).map((point, index) => [points[index], point])

const near = (a, b) => Math.abs(a - b) < 0.5
const overlap = (a1, a2, b1, b2) =>
  Math.min(Math.max(a1, a2), Math.max(b1, b2)) - Math.max(Math.min(a1, a2), Math.min(b1, b2)) > 0.5

/** True when two straight segments lie on one line and overlap. */
const shareLine = ([[ax, ay], [bx, by]], [[cx, cy], [dx, dy]]) => {
  if (near(ay, by) && near(cy, dy) && near(ay, cy)) {
    return overlap(ax, bx, cx, dx)
  }
  if (near(ax, bx) && near(cx, dx) && near(ax, cx)) {
    return overlap(ay, by, cy, dy)
  }
  return false
}

/** Fails the run when a route goes up, crosses a card or a label, or shares a line with another route. */
const checkRoutes = (routes, cards, bands) => {
  for (const route of routes) {
    const name = `${route.edge.from} -> ${route.edge.to}`
    const { points } = route
    if (points[points.length - 1][1] <= points[0][1]) {
      throw new Error(`The arrow ${name} does not go down`)
    }
    for (const segment of segmentsOf(points)) {
      for (const card of cardRects(cards)) {
        if (hitsBox(segment, card)) {
          throw new Error(`The arrow ${name} crosses the card ${card.name}`)
        }
      }
      for (const item of bands) {
        if (hitsBox(segment, labelBox(item), 0)) {
          throw new Error(`The arrow ${name} crosses the label of the layer "${item.layerName}"`)
        }
      }
    }
  }
  routes.forEach((first, index) => {
    for (const second of routes.slice(index + 1)) {
      if (segmentsOf(first.points).some((a) => segmentsOf(second.points).some((b) => shareLine(a, b)))) {
        throw new Error(
          `The arrows ${first.edge.from} -> ${first.edge.to} and ${second.edge.from} -> ${second.edge.to} share a line`,
        )
      }
    }
  })
}

const covers = (segment, x) => x > segment.min + 0.5 && x < segment.max - 0.5
const crossings = (upper, lower) => Number(covers(lower, upper.down)) + Number(covers(upper, lower.up))
const clashes = (a, b) => a.min < b.max + ROUTE.trackClear && b.min < a.max + ROUTE.trackClear

/** Selects the track of a segment: an index in `tracks`, and whether a new track goes in at that index. */
const trackIndex = (tracks, segment) => {
  let best
  const consider = (index, insert, above, below) => {
    const cost =
      above.flat().reduce((sum, other) => sum + crossings(other, segment), 0) +
      below.flat().reduce((sum, other) => sum + crossings(segment, other), 0) +
      (insert ? 0.5 : 0)
    if (best === undefined || cost < best.cost) {
      best = { cost, index, insert }
    }
  }
  tracks.forEach((track, index) => {
    if (!track.some((other) => clashes(other, segment))) {
      consider(index, false, tracks.slice(0, index), tracks.slice(index + 1))
    }
  })
  for (let index = 0; index <= tracks.length; index++) {
    consider(index, true, tracks.slice(0, index), tracks.slice(index))
  }
  return best
}

/** Puts the segments of one channel in tracks. The longest segment goes first. */
const placeTracks = (segments) => {
  const tracks = []
  const sorted = [...segments].sort((a, b) => b.max - b.min - (a.max - a.min) || a.name.localeCompare(b.name))
  for (const segment of sorted) {
    const { index, insert } = trackIndex(tracks, segment)
    if (insert) {
      tracks.splice(index, 0, [segment])
    } else if (tracks[index] === undefined) {
      tracks.push([segment])
    } else {
      tracks[index].push(segment)
    }
  }
  return tracks
}

/** The height of the space under a row that holds `count` tracks. */
const channelHeight = (count) => (count === 0 ? BAND.pad : 2 * ROUTE.channelPad + (count - 1) * ROUTE.trackGap)

/** The ports of each card: evenly spaced on the edge, in the order of the card at the other end. */
const assignPorts = (packages, routes, column) => {
  const centerX = (name) => colX(column.get(name)) + GRID.cardW / 2
  for (const pkg of packages) {
    const name = pkg.folder
    for (const [side, mine, other] of [
      ['out', 'src', 'dst'],
      ['in', 'dst', 'src'],
    ]) {
      const own = routes
        .filter((route) => route[mine] === name)
        .sort(
          (x, y) => (x.lane ?? centerX(x[other])) - (y.lane ?? centerX(y[other])) || x[other].localeCompare(y[other]),
        )
      if ((own.length + 1) * ROUTE.portGap > GRID.cardW) {
        throw new Error(`The card of ${name} has no room for ${String(own.length)} ports`)
      }
      own.forEach((route, index) => {
        route[side] =
          colX(column.get(name)) +
          (GRID.cardW * (index + 1)) / (own.length + 1) +
          (side === 'out' ? -ROUTE.stagger : ROUTE.stagger)
      })
    }
  }
}

/** The lane of each route that passes a row: a vertical line in a gutter, in the margin, or in a free column. */
const assignLanes = (routes, rows, column) => {
  const slots = []
  for (let index = 0; index < GRID.columns; index++) {
    for (let x = colX(index) + ROUTE.laneGap; x <= colX(index) + GRID.cardW - ROUTE.laneGap; x += ROUTE.laneGap) {
      slots.push({ x, column: index, used: [] })
    }
    const start = colX(index) + GRID.cardW
    const limit = index === GRID.columns - 1 ? BAND.x + BAND.w - ROUTE.edge : colX(index + 1) - ROUTE.laneGap
    for (let x = start + ROUTE.laneGap; x <= limit; x += ROUTE.laneGap) {
      slots.push({ x, column: undefined, used: [] })
    }
  }
  const occupied = rows.map((row) => new Set(row.names.map((name) => column.get(name))))
  const everyPort = routes.flatMap((route) => [route.out, route.in])
  const long = routes
    .filter((route) => route.b - route.a >= 2)
    .sort((x, y) => y.b - y.a - (x.b - x.a) || x.src.localeCompare(y.src) || x.dst.localeCompare(y.dst))
  for (const route of long) {
    const between = occupied.slice(route.a + 1, route.b)
    const free = slots
      .filter((slot) => slot.used.every(([from, to]) => to < route.a || from > route.b - 1))
      .filter((slot) => slot.column === undefined || between.every((used) => !used.has(slot.column)))
      .filter((slot) => everyPort.every((port) => Math.abs(port - slot.x) >= ROUTE.portClear))
      .sort(
        (p, q) =>
          Math.abs(p.x - route.out) +
            Math.abs(p.x - route.in) -
            (Math.abs(q.x - route.out) + Math.abs(q.x - route.in)) || p.x - q.x,
      )
    if (free.length === 0) {
      throw new Error(`The arrow ${route.edge.from} -> ${route.edge.to} has no free lane`)
    }
    free[0].used.push([route.a, route.b - 1])
    route.lane = free[0].x
  }
}

/** The package dependency view: one band for each layer (the highest at the top), the cards, and the arrows. */
const packagesDiagram = (packages, layerOf) => {
  const { rows: ordered, column } = arrangeRows(packages, layerOf)
  const rows = ordered.map((row) => ({ ...row }))
  const rowOf = new Map(rows.flatMap((row, index) => row.names.map((name) => [name, index])))
  const lines = new Map(packages.map((pkg) => [pkg.folder, cardLines(pkg, packages)]))
  for (const row of rows) {
    row.h = Math.max(
      CARD_MIN_H,
      ...row.names.map((name) => CARD_TOP + LEAD.name + lines.get(name).length * LEAD.description + 12),
    )
  }
  const routes = packages
    .flatMap((pkg) => pkg.uses.map((use) => ({ edge: { from: pkg.folder, to: use } })))
    .map((route) => {
      const [src, dst] = arrowEnds(route.edge)
      return { ...route, src, dst, a: rowOf.get(src), b: rowOf.get(dst) }
    })
  assignPorts(packages, routes, column)
  assignLanes(routes, rows, column)
  assignPorts(packages, routes, column)
  assignLanes(routes, rows, column)

  // Tracks: each segment of a route in a channel has its own line.
  const channels = Array.from({ length: Math.max(0, rows.length - 1) }, () => [])
  for (const route of routes) {
    const add = (channel, up, down, key) => {
      if (Math.abs(up - down) >= 0.5) {
        const segment = {
          key,
          name: `${route.edge.from} -> ${route.edge.to}`,
          up,
          down,
          min: Math.min(up, down),
          max: Math.max(up, down),
        }
        channels[channel].push(segment)
        route[key] = segment
      }
    }
    if (route.b - route.a === 1) {
      add(route.a, route.out, route.in, 'first')
    } else if (route.b - route.a >= 2) {
      add(route.a, route.out, route.lane, 'first')
      add(route.b - 1, route.lane, route.in, 'last')
    }
  }
  const tracks = channels.map((segments) => placeTracks(segments))
  const trackCount = tracks.map((list, index) =>
    Math.max(list.length, routes.some((route) => route.a === index && route.b === index + 1) ? 1 : 0),
  )

  // Heights: the tracks of the channel below a row sit under that row.
  const bands = []
  const rowBottom = []
  let y = BAND.top
  let current
  rows.forEach((row, index) => {
    if (current === undefined || current.layer !== row.layer) {
      current = { layer: row.layer, y }
      bands.push(current)
      y += BAND.pad
    }
    row.y = y
    y += row.h
    rowBottom.push(y)
    const last = index === rows.length - 1
    y += last ? BAND.pad : channelHeight(trackCount[index])
    if (last || rows[index + 1].layer !== row.layer) {
      current.labelLines = bandLabel(current.layer)
      y = Math.max(y, current.y + LABEL.top + (current.labelLines.length - 1) * LABEL.line + 14)
      current.bottom = y
      y += BAND.spacing
    }
  })
  const bandItems = bands.map((entry) => ({
    kind: 'band',
    x: BAND.x,
    y: entry.y,
    w: BAND.w,
    h: entry.bottom - entry.y,
    labelLines: entry.labelLines,
    layerName: packageLayers[entry.layer].name,
  }))
  const cards = rows.flatMap((row) =>
    row.names.map((name) => ({
      kind: 'card',
      x: colX(column.get(name)),
      y: row.y,
      w: GRID.cardW,
      h: row.h,
      name,
      lines: lines.get(name),
    })),
  )

  // Routes: the points of each arrow.
  const trackY = (channel, segment) =>
    rowBottom[channel] +
    ROUTE.channelPad +
    tracks[channel].findIndex((track) => track.includes(segment)) * ROUTE.trackGap
  const items = routes.map((route) => {
    const from = [route.out, rowBottom[route.a]]
    const to = [route.in, rows[route.b].y]
    let points
    if (route.b <= route.a) {
      points = [from, to]
    } else if (route.b - route.a === 1) {
      points =
        route.first === undefined ?
          [from, [route.out, to[1]]]
        : [from, [route.out, trackY(route.a, route.first)], [route.in, trackY(route.a, route.first)], to]
    } else {
      const first = trackY(route.a, route.first)
      const last = trackY(route.b - 1, route.last)
      points = [from, [route.out, first], [route.lane, first], [route.lane, last], [route.in, last], to]
    }
    route.points = points
    return { kind: 'arrow', tone: 'uses', width: 2, points, uses: { from: route.edge.from, to: route.edge.to } }
  })
  checkRoutes(routes, cards, bandItems)

  const names = packageLayers.map((layer, index) => `layer ${String(index + 1)} (${layer.name})`).join(', ')
  return {
    name: 'packages',
    title: 'Package dependency view: Wishem',
    description: `The view shows ${String(packages.length)} packages in ${String(packageLayers.length)} layers: ${names}. Layer 1 is at the bottom and layer ${String(packageLayers.length)} is at the top. Each of the ${String(routes.length)} arrows goes down from a package to a package that it uses at run time, in dependencies or peerDependencies. A package uses only packages in its own layer or in a lower layer. The line Tests with on a card names the packages that its package has only in devDependencies.`,
    width: BAND.w + 2 * BAND.x,
    height: y + LEGEND_H + 24,
    items: [
      ...bandItems,
      ...cards,
      ...items,
      {
        kind: 'legend',
        x: BAND.x,
        y,
        w: BAND.w,
        entries: [
          ['band', 'Layer'],
          ['card', 'Package'],
          ['uses', 'Uses at run time [dependencies, peerDependencies]'],
        ],
      },
    ],
  }
}

const packages = readPackages()
const { problems, layerOf } = checkPackages(packages)
if (problems.length > 0) {
  for (const problem of problems) {
    console.error(problem)
  }
  process.exit(1)
}

const diagrams = [
  context,
  containers,
  dynamicChange,
  componentsPage,
  componentsWorkbenchProcess,
  packagesDiagram(packages, layerOf),
  entitiesModelFolder,
]

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

// Each theme has the same definitions. Only the strength of the shadow changes.
const shadowFilter = (c, theme) =>
  `<filter id="shadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="${c.night}" flood-opacity="${theme === 'light' ? '0.12' : '0.5'}"/></filter>`

const renderDiagram = (diagram, theme, tokens) => {
  const c = buildColors(tokens, theme)
  const { width, height } = diagram
  const body = order
    .flatMap((kind) => diagram.items.filter((item) => item.kind === kind))
    .map((item) => layers[item.kind](c, item))
    .join('\n')
  const title = text(c, {
    x: 24,
    y: 36,
    line: diagram.title,
    size: SIZE.title,
    weight: 600,
    maxWidth: width - 48,
  })
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(width)} ${String(height)}" width="${String(width)}" height="${String(height)}" role="img" aria-labelledby="title desc">`,
    `<title id="title">${escapeXml(diagram.title)}</title>`,
    `<desc id="desc">${escapeXml(diagram.description)}</desc>`,
    `<defs>${shadowFilter(c, theme)}</defs>`,
    `<rect width="${String(width)}" height="${String(height)}" fill="${c.ground}"/>`,
    title,
    body,
    '</svg>',
    '',
  ].join('\n')
}

const tokens = readTokens()

// Render every file first, so that a failed check writes no file.
const files = diagrams.flatMap((diagram) =>
  ['light', 'dark'].map((theme) => ({
    file: join(outFolder, `${diagram.name}-${theme}.svg`),
    content: renderDiagram(diagram, theme, tokens),
  })),
)

if (options.check) {
  const stale = files.filter(({ file, content }) => !existsSync(file) || readFileSync(file, 'utf8') !== content)
  if (stale.length === 0) {
    console.log('render: each file is current')
  } else {
    for (const { file } of stale) {
      console.log(`render: ${basename(file)} is out of date`)
    }
    console.log('render: run node nodejs/wishem/docs/architecture/render.mjs')
    process.exitCode = 1
  }
} else {
  for (const { file, content } of files) {
    writeFileSync(file, content)
    console.log(`wrote ${file}`)
  }
}
