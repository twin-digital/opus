// Writes the SVG diagrams of the architecture documents.
// Usage: node render.mjs
// Each diagram is described once, below. The script writes one file for each theme.
// Colors come from the role tokens of the workbench. Fonts are embedded as data.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const here = import.meta.dirname
const appFolder = join(here, '..', '..', 'workbench-app')
const tokensFile = join(appFolder, 'src', 'styles', 'tokens.css')

// ---------------------------------------------------------------------------
// Tokens
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

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

const fontFile = (...parts) => join(appFolder, 'node_modules', ...parts)

const fonts = [
  {
    family: 'Bricolage Grotesque',
    weight: '200 800',
    file: fontFile(
      '@fontsource-variable',
      'bricolage-grotesque',
      'files',
      'bricolage-grotesque-latin-wght-normal.woff2',
    ),
  },
  {
    family: 'Inter',
    weight: '100 900',
    file: fontFile('@fontsource-variable', 'inter', 'files', 'inter-latin-wght-normal.woff2'),
  },
  {
    family: 'JetBrains Mono',
    weight: '400',
    file: fontFile('@fontsource', 'jetbrains-mono', 'files', 'jetbrains-mono-latin-400-normal.woff2'),
  },
]

/** The `@font-face` rules with the font files as data. */
const fontFaceCss = () =>
  fonts
    .map(({ family, weight, file }) => {
      const data = readFileSync(file).toString('base64')
      return `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;src:url(data:font/woff2;base64,${data}) format('woff2')}`
    })
    .join('\n')

// ---------------------------------------------------------------------------
// Text: the one place that decides how text is drawn
// ---------------------------------------------------------------------------

const faces = {
  display: { family: "'Bricolage Grotesque', sans-serif", weight: 700, width: 0.6 },
  body: { family: "'Inter', sans-serif", weight: 400, width: 0.57 },
  strong: { family: "'Inter', sans-serif", weight: 600, width: 0.6 },
  mono: { family: "'JetBrains Mono', monospace", weight: 400, width: 0.6 },
}

const escapeXml = (text) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

/** Splits a line on backticks. Odd parts are code. */
const parts = (line) => line.split('`').map((text, index) => ({ text, code: index % 2 === 1 }))

/** The estimated width of a line, for the overflow check. */
const lineWidth = (line, face, size) =>
  parts(line).reduce(
    (total, part) => total + part.text.length * size * (part.code ? faces.mono.width : faces[face].width),
    0,
  )

/**
 * Draws one line of text. A part between backticks uses the mono face.
 * `anchor` is `start`, `middle`, or `end`. `maxWidth` is the width that the text must fit in.
 */
const drawText = (
  colors,
  { x, y, line, face = 'body', size = 12.5, color = 'fg', anchor = 'start', maxWidth, spacing },
) => {
  if (maxWidth !== undefined && lineWidth(line, face, size) > maxWidth) {
    throw new Error(`The text does not fit in ${String(maxWidth)} px: ${line}`)
  }
  const base = faces[face]
  const content = parts(line)
    .filter((part) => part.text !== '')
    .map((part) =>
      part.code ?
        `<tspan font-family="${faces.mono.family}" font-weight="${String(faces.mono.weight)}" font-size="${String(size - 0.5)}">${escapeXml(part.text)}</tspan>`
      : escapeXml(part.text),
    )
    .join('')
  const extra = spacing === undefined ? '' : ` letter-spacing="${String(spacing)}"`
  return `<text x="${String(x)}" y="${String(y)}" font-family="${base.family}" font-weight="${String(base.weight)}" font-size="${String(size)}" fill="${colors[color]}" text-anchor="${anchor}"${extra}>${content}</text>`
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

const PADDING = 14

const drawContainer = (colors, item) =>
  [
    `<rect x="${String(item.x)}" y="${String(item.y)}" width="${String(item.w)}" height="${String(item.h)}" rx="12" fill="none" stroke="${colors.accentText}" stroke-width="1.5" stroke-dasharray="6 5"/>`,
    drawText(colors, {
      x: item.x + PADDING + 2,
      y: item.y + 26,
      line: item.title,
      face: 'display',
      size: 14,
      color: 'accentText',
      maxWidth: item.w - 2 * PADDING,
    }),
  ].join('\n')

const drawBox = (colors, item) => {
  const inner = item.w - 2 * PADDING
  const out = [
    `<rect x="${String(item.x)}" y="${String(item.y)}" width="${String(item.w)}" height="${String(item.h)}" rx="8" fill="${colors.surface}" stroke="${item.strong ? colors.accentText : colors.controlBorder}" stroke-width="${item.strong ? '2' : '1.5'}"/>`,
  ]
  const tagWidth = item.tag === undefined ? 0 : item.tag.length * 10.5 * 0.6 + 12
  out.push(
    drawText(colors, {
      x: item.x + PADDING,
      y: item.y + 27,
      line: item.title,
      face: 'display',
      size: 16,
      maxWidth: inner - tagWidth,
    }),
  )
  if (item.tag !== undefined) {
    out.push(
      drawText(colors, {
        x: item.x + item.w - PADDING,
        y: item.y + 26,
        line: item.tag,
        face: 'mono',
        size: 10.5,
        color: 'fgMuted',
        anchor: 'end',
        spacing: 1,
      }),
    )
  }
  item.lines.forEach((line, index) => {
    out.push(
      drawText(colors, {
        x: item.x + PADDING,
        y: item.y + 50 + index * 18,
        line,
        maxWidth: inner,
      }),
    )
  })
  return out.join('\n')
}

const drawPill = (colors, item) => {
  const out = [
    `<rect x="${String(item.x)}" y="${String(item.y)}" width="${String(item.w)}" height="${String(item.h)}" rx="${String(item.h / 2)}" fill="${colors.maker}"/>`,
    drawText(colors, {
      x: item.x + item.w / 2,
      y: item.y + item.h / 2 + 6,
      line: item.title,
      face: 'display',
      size: 18,
      color: 'night',
      anchor: 'middle',
      maxWidth: item.w - 2 * PADDING,
    }),
  ]
  return out.join('\n')
}

/** An arrow along `points`. The last segment ends in an arrow head. */
const drawArrow = (colors, item) => {
  const color = item.color ?? 'fgMuted'
  const stroke = colors[color]
  const points = item.points
  const [tipX, tipY] = points[points.length - 1]
  const [fromX, fromY] = points[points.length - 2]
  const length = Math.hypot(tipX - fromX, tipY - fromY)
  const ux = (tipX - fromX) / length
  const uy = (tipY - fromY) / length
  const size = 9
  const half = 4.5
  const baseX = tipX - ux * size
  const baseY = tipY - uy * size
  const round = (value) => String(Math.round(value * 100) / 100)
  const head = [
    [tipX, tipY],
    [baseX - uy * half, baseY + ux * half],
    [baseX + uy * half, baseY - ux * half],
  ]
    .map(([x, y]) => `${round(x)},${round(y)}`)
    .join(' ')
  const line = points
    .map(([x, y], index) =>
      index === points.length - 1 ? `${round(baseX)},${round(baseY)}` : `${String(x)},${String(y)}`,
    )
    .join(' ')
  const out = [
    `<polyline points="${line}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"/>`,
    `<polygon points="${head}" fill="${stroke}"/>`,
  ]
  const label = item.label
  if (label !== undefined) {
    label.lines.forEach((text, index) => {
      out.push(
        drawText(colors, {
          x: label.x,
          y: label.y + index * 16,
          line: text,
          size: 12,
          color,
          anchor: label.anchor ?? 'start',
          maxWidth: label.maxWidth,
        }),
      )
    })
  }
  return out.join('\n')
}

const drawItem = (colors, item) => {
  switch (item.kind) {
    case 'container':
      return drawContainer(colors, item)
    case 'box':
      return drawBox(colors, item)
    case 'pill':
      return drawPill(colors, item)
    case 'arrow':
      return drawArrow(colors, item)
    case 'note':
      return drawText(colors, item)
    default:
      throw new Error(`Unknown item kind: ${String(item.kind)}`)
  }
}

// ---------------------------------------------------------------------------
// Diagram descriptions
// ---------------------------------------------------------------------------

const processes = {
  name: 'processes',
  title: 'The processes of the workbench',
  description:
    'The designer runs the start script, which starts the host and the Vite development server in one Node.js process. The page in the web browser gets its code and its snapshots from the Vite server. The host reads and watches the model folder. The designer edits the model folder by hand.',
  width: 880,
  height: 514,
  items: [
    // Containers
    { kind: 'container', x: 24, y: 40, w: 240, h: 184, title: 'Web browser' },
    { kind: 'container', x: 504, y: 40, w: 352, h: 324, title: 'One Node.js process: the start script' },

    // Boxes
    {
      kind: 'box',
      x: 44,
      y: 84,
      w: 200,
      h: 116,
      title: 'Page',
      lines: ['client of the core,', 'renderer, AppBar view'],
    },
    {
      kind: 'box',
      x: 528,
      y: 84,
      w: 304,
      h: 116,
      title: 'Vite development server',
      lines: ['serves the page and the views', 'passes `/snapshot` and `/snapshots`'],
    },
    { kind: 'box', x: 528, y: 264, w: 304, h: 76, title: 'Host', lines: ['core of the workbench'] },
    {
      kind: 'box',
      x: 504,
      y: 424,
      w: 352,
      h: 76,
      title: 'Model folder',
      lines: ['definitions and `state.json`'],
    },
    { kind: 'pill', x: 24, y: 424, w: 240, h: 76, title: 'Designer' },

    // Between the page and the Vite server
    {
      kind: 'arrow',
      points: [
        [528, 108],
        [244, 108],
      ],
      label: { x: 386, y: 102, anchor: 'middle', lines: ['page code and view modules'], maxWidth: 230 },
    },
    {
      kind: 'arrow',
      points: [
        [244, 144],
        [528, 144],
      ],
      label: { x: 386, y: 138, anchor: 'middle', lines: ['`GET /snapshots`'], maxWidth: 230 },
    },
    {
      kind: 'arrow',
      points: [
        [528, 180],
        [244, 180],
      ],
      label: { x: 386, y: 174, anchor: 'middle', lines: ['each snapshot'], maxWidth: 230 },
    },

    // Between the Vite server and the host
    {
      kind: 'arrow',
      points: [
        [560, 200],
        [560, 264],
      ],
      label: { x: 570, y: 236, lines: ['passes the request'], maxWidth: 130 },
    },
    {
      kind: 'arrow',
      points: [
        [800, 264],
        [800, 200],
      ],
      label: { x: 790, y: 236, anchor: 'end', lines: ['each snapshot'], maxWidth: 90 },
    },

    // Host and model folder
    {
      kind: 'arrow',
      points: [
        [680, 340],
        [680, 424],
      ],
      label: { x: 690, y: 388, lines: ['reads and watches'], maxWidth: 140 },
    },

    // The designer
    {
      kind: 'arrow',
      color: 'makerText',
      points: [
        [84, 424],
        [84, 200],
      ],
      label: { x: 94, y: 318, lines: ['opens the address', 'of the page'], maxWidth: 120 },
    },
    {
      kind: 'arrow',
      color: 'makerText',
      points: [
        [224, 424],
        [224, 302],
        [504, 302],
      ],
      label: { x: 364, y: 294, anchor: 'middle', lines: ['runs and stops the start script'], maxWidth: 250 },
    },
    {
      kind: 'arrow',
      color: 'makerText',
      points: [
        [264, 462],
        [504, 462],
      ],
      label: { x: 384, y: 454, anchor: 'middle', lines: ['edits by hand'], maxWidth: 200 },
    },
  ],
}

const picture = {
  name: 'picture',
  title: 'From a file to a picture',
  description:
    'The host reads the definition file and the state file and makes a snapshot. The client of the core in the page receives the snapshot. The renderer takes the view of each component type from the table of views, gives the props to the view, and draws the result in a marked element.',
  width: 880,
  height: 744,
  items: [
    { kind: 'note', x: 24, y: 30, line: 'THE MODEL', face: 'mono', size: 11, color: 'fgMuted', spacing: 1.5 },
    { kind: 'note', x: 456, y: 30, line: 'THE VIEWS', face: 'mono', size: 11, color: 'fgMuted', spacing: 1.5 },

    // The model column
    {
      kind: 'box',
      x: 24,
      y: 56,
      w: 192,
      h: 76,
      title: 'Definition file',
      lines: ['`definitions/ct_….json`', 'AppBar and its field'],
    },
    {
      kind: 'box',
      x: 232,
      y: 56,
      w: 192,
      h: 76,
      title: 'State file',
      lines: ['`state.json`', 'one AppBar entity'],
    },
    {
      kind: 'box',
      x: 24,
      y: 172,
      w: 400,
      h: 76,
      title: 'Host',
      tag: 'NODE.JS',
      lines: ['reads and watches the two files', '`readModelFolder`, `validateModel`, `createCore`'],
    },
    {
      kind: 'box',
      x: 24,
      y: 288,
      w: 400,
      h: 76,
      title: 'Snapshot',
      tag: 'JSON',
      lines: ['the definitions and the entities', 'sent again after each change'],
    },
    {
      kind: 'box',
      x: 24,
      y: 404,
      w: 400,
      h: 76,
      title: 'Client of the core',
      tag: 'BROWSER',
      lines: ['`connect()` opens the stream of snapshots', 'gives `getSnapshot` and `subscribe`'],
    },
    {
      kind: 'arrow',
      points: [
        [120, 132],
        [120, 172],
      ],
    },
    {
      kind: 'arrow',
      points: [
        [328, 132],
        [328, 172],
      ],
    },
    {
      kind: 'arrow',
      points: [
        [224, 248],
        [224, 288],
      ],
      label: { x: 234, y: 273, lines: ['`getSnapshot`'], maxWidth: 180 },
    },
    {
      kind: 'arrow',
      points: [
        [224, 364],
        [224, 404],
      ],
      label: { x: 234, y: 389, lines: ['`GET /snapshots`, through Vite'], maxWidth: 215 },
    },

    // The views column
    {
      kind: 'box',
      x: 456,
      y: 56,
      w: 400,
      h: 76,
      title: 'View file',
      tag: 'FILE',
      lines: ['`src/views/AppBar.tsx`', '`defineView`: component type ID, props, render'],
    },
    {
      kind: 'box',
      x: 456,
      y: 172,
      w: 400,
      h: 76,
      title: 'Table of views',
      tag: 'BROWSER',
      lines: ['`collectViews` reads `src/views/*.tsx`', 'a table from component type ID to view'],
    },
    {
      kind: 'arrow',
      points: [
        [656, 132],
        [656, 172],
      ],
      label: { x: 666, y: 157, lines: ['served by Vite'], maxWidth: 180 },
    },

    // The join
    {
      kind: 'box',
      x: 24,
      y: 520,
      w: 832,
      h: 76,
      title: 'Renderer',
      tag: 'BROWSER',
      lines: [
        'for each entity and each component type that has a view:',
        'takes each prop by field ID and calls `render`',
      ],
    },
    {
      kind: 'arrow',
      points: [
        [224, 480],
        [224, 520],
      ],
      label: { x: 234, y: 505, lines: ['the snapshot'], maxWidth: 180 },
    },
    {
      kind: 'arrow',
      points: [
        [656, 248],
        [656, 520],
      ],
      label: { x: 666, y: 390, lines: ['the view of each', 'component type'], maxWidth: 180 },
    },
    {
      kind: 'box',
      x: 24,
      y: 636,
      w: 832,
      h: 76,
      strong: true,
      title: 'Marked element',
      tag: 'BROWSER',
      lines: [
        '`<div data-wishem-entity="e_…" data-wishem-component-type="ct_…">`',
        'wraps the picture of the view: the app bar',
      ],
    },
    {
      kind: 'arrow',
      points: [
        [440, 596],
        [440, 636],
      ],
      label: { x: 450, y: 621, lines: ['draws'], maxWidth: 180 },
    },
  ],
}

const diagrams = [processes, picture]

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const roles = {
  ground: 'ground',
  surface: 'surface',
  night: 'night',
  fg: 'fg',
  fgMuted: 'fg-muted',
  controlBorder: 'control-border',
  maker: 'maker',
  makerText: 'maker-text',
  accentText: 'accent-text',
}

const renderDiagram = (diagram, theme, tokens, css) => {
  const colors = Object.fromEntries(
    Object.entries(roles).map(([key, token]) => [key, resolveColor(tokens, token, theme)]),
  )
  const body = diagram.items.map((item) => drawItem(colors, item)).join('\n')
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(diagram.width)} ${String(diagram.height)}" width="${String(diagram.width)}" height="${String(diagram.height)}" role="img" aria-labelledby="title desc">`,
    `<title id="title">${escapeXml(diagram.title)}</title>`,
    `<desc id="desc">${escapeXml(diagram.description)}</desc>`,
    `<style>\n${css}\n</style>`,
    `<rect width="${String(diagram.width)}" height="${String(diagram.height)}" fill="${colors.ground}"/>`,
    body,
    '</svg>',
    '',
  ].join('\n')
}

const tokens = readTokens()
const css = fontFaceCss()

for (const diagram of diagrams) {
  for (const theme of ['light', 'dark']) {
    const file = join(here, `${diagram.name}-${theme}.svg`)
    writeFileSync(file, renderDiagram(diagram, theme, tokens, css))
    console.log(`wrote ${file}`)
  }
}
