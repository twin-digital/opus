#!/usr/bin/env node
// Writes a PNG image of each SVG file, as a reader sees it on a page.
// Usage: node rasterize.mjs --width <px> --background <color> --out <dir> [--scale <n>] [--image <docker image>] <file.svg>...
//
// The browser is Chromium in the Playwright Docker image. The default image tag is the
// `@playwright/test` version of the catalog in `pnpm-workspace.yaml`. The SVG goes to the
// container on stdin, so the Docker host needs no access to the files.
// Each PNG is `<out>/<svg name>.png`. Its width is `--width`, and its height follows the viewBox.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const usage =
  'Usage: node rasterize.mjs --width <px> --background <color> --out <dir> [--scale <n>] [--image <docker image>] <file.svg>...'

let parsed
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      width: { type: 'string' },
      background: { type: 'string' },
      out: { type: 'string' },
      scale: { type: 'string', default: '1' },
      image: { type: 'string' },
    },
  })
} catch (error) {
  console.error(`${error.message}\n${usage}`)
  process.exit(2)
}
const { values, positionals: files } = parsed
const width = Number(values.width)
const scale = Number(values.scale)
if (!Number.isInteger(width) || width <= 0 || !(scale > 0) || !values.background || !values.out || files.length === 0) {
  console.error(usage)
  process.exit(2)
}
if (!/^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/.test(values.background)) {
  console.error(`The background must be a hex color or a color name: ${values.background}`)
  process.exit(2)
}

/** The Playwright image that matches the catalog version of `@playwright/test`. */
const defaultImage = () => {
  let dir = dirname(resolve(import.meta.dirname))
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir)
    if (parent === dir) {
      throw new Error('No pnpm-workspace.yaml above this script. Give --image.')
    }
    dir = parent
  }
  const match = /['"]?@playwright\/test['"]?\s*:\s*['"]?\^?~?([0-9]+\.[0-9]+\.[0-9]+)/.exec(
    readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8'),
  )
  if (match === null) {
    throw new Error('No @playwright/test version in pnpm-workspace.yaml. Give --image.')
  }
  return `mcr.microsoft.com/playwright:v${match[1]}-noble`
}

const image = values.image ?? defaultImage()

// Runs in the container: reads the page from stdin, takes a screenshot, and writes the PNG as base64.
const script = [
  'set -e',
  'cat > /tmp/page.html',
  'shell=$(ls -d /ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell | head -n 1)',
  '"$shell" --no-sandbox --hide-scrollbars --force-device-scale-factor="$SCALE" --window-size="$SIZE" --screenshot=/tmp/out.png file:///tmp/page.html >/dev/null 2>&1',
  'base64 -w 0 /tmp/out.png',
].join('\n')

mkdirSync(values.out, { recursive: true })
let failed = false
for (const file of files) {
  const svg = readFileSync(file, 'utf8')
  const viewBox = /viewBox\s*=\s*["']\s*[-0-9.]+[\s,]+[-0-9.]+[\s,]+([0-9.]+)[\s,]+([0-9.]+)\s*["']/.exec(svg)
  if (viewBox === null) {
    console.log(`FAIL  ${file}: has no viewBox`)
    failed = true
    continue
  }
  const height = Math.ceil((width * Number(viewBox[2])) / Number(viewBox[1]))
  const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  const page = `<!doctype html><html><body style="margin:0;background:${values.background}"><img src="${source}" style="display:block;width:${String(width)}px;height:${String(height)}px"></body></html>`
  const output = execFileSync(
    'docker',
    [
      'run',
      '--rm',
      '-i',
      '-e',
      `SCALE=${String(scale)}`,
      '-e',
      `SIZE=${String(width)},${String(height)}`,
      image,
      'sh',
      '-c',
      script,
    ],
    { input: page, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'inherit'] },
  )
  const target = join(values.out, `${basename(file, '.svg')}.png`)
  writeFileSync(target, Buffer.from(output.trim(), 'base64'))
  console.log(`wrote ${target} (${String(width)} x ${String(height)} px at scale ${String(scale)})`)
}

process.exit(failed ? 1 : 0)
