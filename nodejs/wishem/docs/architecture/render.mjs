// Writes the SVG diagrams of the architecture documents.
// Usage: node render.mjs
// Each diagram is described once, below. The script writes one file for each theme.
// Colors come from the role tokens of the workbench. Text uses the standard typeface of the system.
// The script writes C4 diagrams and an entity diagram (docs/diagrams.md).
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
    border: mix(c.line, c.fgMuted, 0.2),
    componentBorder: mix(c.line, c.accentText, 0.6),
    flow: c.makerText,
    quiet: c.controlBorder,
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
  const { x, y, w, h, shape, name, type, description, focus = false } = item
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

/** The lines of a label: the verb phrase, and the technology in brackets on a second line. */
const labelLines = (label) => {
  const split = label.indexOf(' [')
  return split === -1 ? [label] : [label.slice(0, split), label.slice(split + 1)]
}

/** The size of the chip of a label. */
const chipSize = (label) => ({
  w: Math.max(...labelLines(label).map((line) => textWidth(line, { size: SIZE.detail, weight: 500 }))) + CHIP_PAD,
  h: labelLines(label).length === 1 ? 24 : 40,
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
    `<path d="${roundedPath(points, [tip[0] - ux * (HEAD_LENGTH - 1), tip[1] - uy * (HEAD_LENGTH - 1)])}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
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
          y: lines.length === 1 ? at[1] + 4.5 : at[1] - 3 + index * 15,
          line: part,
          weight: index === 0 ? 500 : 400,
          color,
          anchor: 'middle',
        }),
      )
    })
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
  if (kind === 'flow' || kind === 'quiet') {
    const color = c[kind]
    return [
      `<path d="M${num(x)} ${num(cy)} L${num(x + SAMPLE_W - HEAD_LENGTH + 1)} ${num(cy)}" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>`,
      `<polygon points="${arrowHead([x + SAMPLE_W, cy], 1, 0)}" fill="${color}" stroke="${color}" stroke-width="1" stroke-linejoin="round"/>`,
    ].join('\n')
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

const layers = { group, element, entity, arrow, relationship, legend }
const order = ['group', 'element', 'entity', 'arrow', 'relationship', 'legend']

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

// Containers. The gutter on the left holds the arrow from the page to `hub`.
const GUTTER = 64
const gx = (x) => x + GUTTER
const cDesigner = el('person', gx(MIDDLE), 64, 'Designer', '[Person]', 'Makes a product with the workbench.', {
  h: 124,
})
const cPage = el(
  'container',
  gx(LEFT),
  284,
  'Page',
  '[Container: React, web browser]',
  'Draws each component that has a view.',
)
const cModel = el(
  'store',
  gx(RIGHT),
  284,
  'Model folder',
  '[Container: JSON files]',
  'Holds the definitions and the authored state.',
)
const cProduct = el(
  'store',
  gx(RIGHT),
  564,
  'Product model folder',
  '[Container: JSON files]',
  'Holds the model of the mounted product.',
)
const cProcess = el(
  'container',
  gx(MIDDLE),
  564,
  'Workbench process',
  '[Container: Node.js]',
  'Runs the constructs and serves the page.',
)
const cHost = el(
  'container',
  gx(LEFT),
  804,
  'host-nodejs',
  '[Container: TypeScript package]',
  'Runs a construct and serves the link.',
)
const cCore = el(
  'container',
  gx(RIGHT),
  804,
  'core',
  '[Container: TypeScript package]',
  'Checks a model and holds the store.',
)
const cManager = el(
  'container',
  gx(MIDDLE),
  1004,
  'construct-manager',
  '[Container: TypeScript package]',
  'The construct list and the construct manager.',
)
const cHub = el(
  'container',
  gx(MIDDLE),
  1204,
  'hub',
  '[Container: TypeScript package]',
  'Joins the subsystems and carries the link.',
)
const cRenderer = el(
  'container',
  gx(MIDDLE),
  2044,
  'renderer-react',
  '[Container: TypeScript package]',
  'Draws React views from a port.',
)

const cClock = el(
  'container',
  gx(MIDDLE),
  1424,
  'clock',
  '[Container: TypeScript package]',
  'Holds the time subsystem and the clock.',
)

// The update subsystem sits in its own column on the right, so that its arrows keep a free zone for their labels.
const UPDATE_X = 1320
const cUpdate = el(
  'container',
  UPDATE_X,
  1000,
  'update',
  '[Container: TypeScript package]',
  'The update subsystem: runs the native behaviors at each tick.',
  { h: 160 },
)

const cPixiPage = el(
  'container',
  gx(LEFT),
  1824,
  'PixiJS page',
  '[Container: PixiJS, web browser]',
  'Draws the PixiJS construct and sends the keys.',
)
const cPixiProcess = el(
  'container',
  gx(RIGHT),
  1824,
  'PixiJS process',
  '[Container: Node.js]',
  'Runs the construct with its update subsystem and clock.',
)
const cRendererPixi = el(
  'container',
  gx(LEFT),
  2044,
  'renderer-pixi',
  '[Container: TypeScript package]',
  'Draws PixiJS views from a port.',
)
const cSample = el(
  'container',
  gx(RIGHT),
  2044,
  'sample-product',
  '[Container: TypeScript package]',
  'Holds the example model folder and the count behavior.',
)

const cGodotRunner = el(
  'container',
  gx(MIDDLE),
  2290,
  'Godot runner',
  '[Container: Node.js]',
  'Starts Godot in Docker, carries the link.',
)
const cGodotApp = el(
  'container',
  gx(MIDDLE),
  2610,
  'Godot application',
  '[Container: GDScript, Docker]',
  'Draws the construct and writes screenshots.',
)
const cGodotProcess = el(
  'container',
  gx(RIGHT),
  2610,
  'Godot process',
  '[Container: Node.js]',
  'Runs the construct with a clock.',
)

/** Moves each item of a diagram down by `dy`. */
const shiftY = (items, dy) =>
  items.map((it) =>
    it.kind === 'arrow' ?
      {
        ...it,
        points: it.points.map(([x, y]) => [x, y + dy]),
        label: { ...it.label, at: [it.label.at[0], it.label.at[1] + dy] },
      }
    : { ...it, y: it.y + dy },
  )

// The system boundary reaches the update column.
const GROUP_W = UPDATE_X + CARD_W + 20 - 24

const containers = {
  name: 'containers',
  title: 'Container diagram: Wishem',
  description:
    'Wishem has eighteen containers. The workbench process runs the host-nodejs package, uses the core package, and runs the product constructs with the construct-manager package. The workbench process loads the product code from the sample-product package with a dynamic import. The construct-manager package builds on the core, hub, clock, and host-nodejs packages. The host-nodejs and core packages build on the hub package, and so does the page. The page and the workbench process build on the renderer-react package, and renderer-react builds on the hub package. The clock package builds on the hub package. The update package builds on the core, hub, and clock packages. The PixiJS process runs the behaviors with the update package, serves the link with the host-nodejs package and builds on the clock, core, and hub packages. The PixiJS page builds on the renderer-pixi, hub, and clock packages. The PixiJS page gets page code over HTTP and connects to the hub over a WebSocket link through the PixiJS process. The workbench process reads, watches, and writes the model folder and the product model folder. The page gets page code over HTTP and connects to the hub over a WebSocket link through the process. The Godot process serves the link with the host-nodejs package and builds on the clock, core, and hub packages. The Godot runner starts the Godot application in Docker and carries the link of the application over TCP to the Godot process. The Godot application connects to the hub over a WebSocket link through the Godot runner. The designer starts the three processes and the Godot runner, edits the two folders, and looks at the two pages.',
  width: 1614,
  height: 3090,
  items: shiftY(
    [
      { kind: 'group', x: 24, y: 224, w: GROUP_W, h: 2676, label: SYSTEM },
      cDesigner,
      cPage,
      cModel,
      cProduct,
      cProcess,
      cHost,
      cCore,
      cManager,
      cHub,
      cRenderer,
      cClock,
      cUpdate,
      cPixiPage,
      cPixiProcess,
      cRendererPixi,
      cSample,
      cGodotRunner,
      cGodotApp,
      cGodotProcess,

      // The primary path: a change to the model becomes a new picture
      rel('flow', [left(cDesigner, 126), [gx(240), 126], top(cPage, gx(240))], 'Looks at [web browser]', [
        gx(240),
        200,
      ]),
      rel('flow', [right(cDesigner, 126), [gx(640), 126], top(cModel, gx(640))], 'Edits files [text editor]', [
        gx(640),
        200,
      ]),
      rel(
        'flow',
        [top(cProcess, 530), [530, 424], [800, 424], bottom(cModel, 800)],
        'Reads, watches, and writes [file system]',
        [663, 424],
      ),
      rel(
        'quiet',
        [top(cProcess, 590), [590, 500], [850, 500], top(cProduct, 850)],
        'Reads, watches, and writes [file system]',
        [720, 500],
      ),
      rel(
        'quiet',
        [right(cDesigner, 96), [930, 96], [930, 616], right(cProduct, 616)],
        'Edits files [text editor]',
        [760, 96],
      ),
      rel('flow', [bottom(cPage, gx(96)), [gx(96), 640], left(cProcess, 640)], 'Connects to the hub [WebSocket link]', [
        gx(96),
        550,
      ]),

      // The other relationships
      rel('quiet', [bottom(cDesigner), top(cProcess)], 'Starts and stops [terminal]', [gx(440), 336]),
      rel('quiet', [bottom(cPage, gx(250)), [gx(250), 600], left(cProcess, 600)], 'Gets page code [HTTP]', [
        gx(250),
        524,
      ]),
      rel('quiet', [bottom(cProcess, gx(375)), [gx(375), 716], [gx(173), 716], top(cHost)], 'Runs [import]', [
        gx(274),
        716,
      ]),
      rel('quiet', [bottom(cProcess, 569), [569, 716], [860, 716], top(cCore, 860)], 'Uses [import]', [670, 716]),
      rel(
        'quiet',
        [bottom(cProcess, 470), top(cManager, 470)],
        'Runs the product constructs with [import]',
        [470, 940],
      ),
      rel(
        'quiet',
        [bottom(cProcess, 520), [520, 770], [923, 770], [923, 2096], right(cSample, 2096)],
        'Loads the product code [dynamic import]',
        [693, 770],
      ),
      rel('quiet', [right(cHost), left(cCore)], 'Builds on [import]', [570, 856]),
      rel('quiet', [bottom(cCore, 771), [771, 1256], right(cHub, 1256)], 'Builds on [import]', [771, 1130]),
      rel('quiet', [bottom(cHost, gx(173)), [gx(173), 1220], left(cHub, 1220)], 'Builds on [import]', [gx(173), 1100]),
      rel('quiet', [left(cPage, 360), [68, 360], [68, 1252], left(cHub, 1252)], 'Builds on [import]', [223, 1252]),
      rel(
        'quiet',
        [left(cPage, 330), [44, 330], [44, 2190], [460, 2190], bottom(cRenderer, 460)],
        'Builds on [import]',
        [250, 2190],
      ),
      rel(
        'quiet',
        [bottom(cProcess, 614), [614, 692], [950, 692], [950, 2190], [548, 2190], bottom(cRenderer, 548)],
        'Builds on [import]',
        [840, 692],
      ),
      rel('quiet', [top(cClock), bottom(cHub)], 'Builds on [import]', [gx(440), 1366]),
      rel(
        'quiet',
        [bottom(cRenderer, 420), [420, 2212], [90, 2212], [90, 1294], left(cHub, 1294)],
        'Builds on [import]',
        [250, 1294],
      ),

      // The construct manager
      rel('quiet', [bottom(cManager), top(cHub)], 'Builds on [import]', [gx(440), 1156]),
      rel('quiet', [right(cManager, 1050), [690, 1050], bottom(cCore, 690)], 'Builds on [import]', [690, 975]),
      rel('quiet', [left(cManager, 1050), [310, 1050], bottom(cHost, 310)], 'Builds on [import]', [310, 975]),
      rel(
        'quiet',
        [right(cManager, 1080), [700, 1080], [700, 1450], right(cClock, 1450)],
        'Builds on [import]',
        [700, 1330],
      ),

      // The PixiJS construct
      rel(
        'flow',
        [left(cDesigner, 160), [14, 160], [14, 1876], left(cPixiPage, 1876)],
        'Looks at and presses keys [web browser]',
        [180, 160],
      ),
      rel(
        'quiet',
        [right(cDesigner, 160), [1016, 160], [1016, 1876], right(cPixiProcess, 1876)],
        'Starts and stops [terminal]',
        [800, 160],
      ),
      rel('quiet', [right(cPixiPage, 1852), left(cPixiProcess, 1852)], 'Gets page code [HTTP]', [gx(440), 1852]),
      rel('flow', [right(cPixiPage, 1906), left(cPixiProcess, 1906)], 'Connects to the hub [WebSocket link]', [
        gx(440),
        1906,
      ]),
      rel('quiet', [bottom(cPixiPage), top(cRendererPixi)], 'Builds on [import]', [gx(173), 1986]),
      rel(
        'quiet',
        [top(cPixiPage, 250), [250, 1380], [410, 1380], bottom(cHub, 410)],
        'Builds on [import]',
        [250, 1570],
      ),
      rel('quiet', [top(cPixiPage, 345), [345, 1476], left(cClock, 1476)], 'Builds on [import]', [345, 1640]),
      rel('quiet', [top(cPixiProcess, 660), [660, 1500], right(cClock, 1500)], 'Builds on [import]', [660, 1660]),
      rel(
        'quiet',
        [top(cPixiProcess, 760), [760, 1380], [600, 1380], bottom(cHub, 600)],
        'Builds on [import]',
        [760, 1570],
      ),
      rel('quiet', [top(cPixiProcess, 850), bottom(cCore, 850)], 'Builds on [import]', [850, 1400]),
      rel(
        'quiet',
        [top(cPixiProcess, 700), [700, 1770], [125, 1770], bottom(cHost, 125)],
        'Serves the link with [import]',
        [500, 1770],
      ),
      // The update subsystem
      rel('quiet', [left(cUpdate, 1030), [1165, 1030], [1165, 850], right(cCore, 850)], 'Builds on [import]', [
        UPDATE_X - 80,
        1030,
      ]),
      rel('quiet', [left(cUpdate, 1080), [1125, 1080], [1125, 1226], right(cHub, 1226)], 'Builds on [import]', [
        UPDATE_X - 80,
        1080,
      ]),
      rel('quiet', [left(cUpdate, 1130), [1145, 1130], [1145, 1435], right(cClock, 1435)], 'Builds on [import]', [
        UPDATE_X - 80,
        1130,
      ]),
      rel(
        'quiet',
        [right(cPixiProcess, 1850), [1420, 1850], bottom(cUpdate, 1420)],
        'Runs the behaviors with [import]',
        [1420, 1500],
      ),

      // The Godot construct
      rel(
        'quiet',
        [top(cDesigner, 540), [540, -20], [1056, -20], [1056, 2370], right(cGodotRunner, 2370)],
        'Starts and stops [terminal]',
        [800, -20],
      ),
      rel(
        'quiet',
        [top(cDesigner, 600), [600, 30], [1040, 30], [1040, 2640], right(cGodotProcess, 2640)],
        'Starts and stops [terminal]',
        [900, 30],
      ),
      rel(
        'quiet',
        [bottom(cGodotRunner, 440), top(cGodotApp, 440)],
        'Starts and copies the screenshots [Docker]',
        [440, 2455],
      ),
      rel(
        'flow',
        [top(cGodotApp, 610), bottom(cGodotRunner, 610)],
        'Connects to the hub [WebSocket link]',
        [610, 2540],
      ),
      rel(
        'quiet',
        [right(cGodotRunner, 2342), [770, 2342], top(cGodotProcess, 770)],
        'Carries the link [TCP]',
        [770, 2476],
      ),
      rel(
        'quiet',
        [bottom(cGodotProcess, 660), [660, 2796], [102, 2796], [102, 870], left(cHost, 870)],
        'Serves the link with [import]',
        [300, 2796],
      ),
      rel(
        'quiet',
        [bottom(cGodotProcess, 690), [690, 2842], [1105, 2842], [1105, 880], right(cCore, 880)],
        'Builds on [import]',
        [960, 2842],
      ),
      rel(
        'quiet',
        [bottom(cGodotProcess, 740), [740, 2796], [1090, 2796], [1090, 1290], right(cHub, 1290)],
        'Builds on [import]',
        [960, 2796],
      ),
      rel(
        'quiet',
        [bottom(cGodotProcess, 790), [790, 2750], [1075, 2750], [1075, 1475], right(cClock, 1475)],
        'Builds on [import]',
        [960, 2750],
      ),
      {
        kind: 'legend',
        x: 24,
        y: 2930,
        w: GROUP_W,
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
    60,
  ),
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

const diagrams = [context, containers, dynamicChange, componentsPage, entitiesModelFolder]

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
    file: join(here, `${diagram.name}-${theme}.svg`),
    content: renderDiagram(diagram, theme, tokens),
  })),
)

for (const { file, content } of files) {
  writeFileSync(file, content)
  console.log(`wrote ${file}`)
}
