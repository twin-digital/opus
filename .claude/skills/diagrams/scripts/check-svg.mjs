#!/usr/bin/env node
// Checks SVG diagram files for permanent documentation.
// Usage: node check-svg.mjs <file.svg>...
//
// Each file fails when it:
// - holds font data (`@font-face`, or a `data:` URL of a font)
// - references `url(#id)` or `href="#id"` with no element that has that `id`
// - has no `<title>` or no `<desc>`, or one of them is empty
// When the list holds `<name>-light.svg` and `<name>-dark.svg`, the pair fails when the visible text of the two files differs.
// The exit code is 0 when each check passes, 1 when a check fails, and 2 for a usage error.
import { readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const files = process.argv.slice(2)
if (files.length === 0 || files.some((file) => file.startsWith('-'))) {
  console.error('Usage: node check-svg.mjs <file.svg>...')
  process.exit(2)
}

const decode = (value) =>
  value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replaceAll('&amp;', '&')

/** The text of each `<text>` element, in document order, with its `tspan` content joined. */
const visibleText = (svg) =>
  [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((match) =>
    decode(match[1].replace(/<[^>]*>/g, ''))
      .replace(/\s+/g, ' ')
      .trim(),
  )

const elementText = (svg, name) => {
  const match = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`).exec(svg)
  return match === null ? undefined : decode(match[1].replace(/<[^>]*>/g, '')).trim()
}

const checkFile = (svg) => {
  const problems = []
  if (/@font-face/i.test(svg)) {
    problems.push('holds an @font-face rule')
  }
  if (/data:(?:font\/|application\/(?:x-)?font)/i.test(svg) || /\.(?:woff2?|ttf|otf)\b/i.test(svg)) {
    problems.push('holds or references font data')
  }
  const ids = new Set([...svg.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map((match) => match[1]))
  const references = [
    ...[...svg.matchAll(/url\(\s*["']?#([^"')\s]+)["']?\s*\)/g)].map((match) => match[1]),
    ...[...svg.matchAll(/\bhref\s*=\s*["']#([^"']+)["']/g)].map((match) => match[1]),
  ]
  for (const id of new Set(references)) {
    if (!ids.has(id)) {
      problems.push(`references #${id}, but no element has that id`)
    }
  }
  for (const name of ['title', 'desc']) {
    const value = elementText(svg, name)
    if (value === undefined) {
      problems.push(`has no <${name}>`)
    } else if (value === '') {
      problems.push(`has an empty <${name}>`)
    }
  }
  return problems
}

const checkPair = (light, dark) => {
  const a = visibleText(light)
  const b = visibleText(dark)
  const length = Math.max(a.length, b.length)
  for (let i = 0; i < length; i++) {
    if (a[i] !== b[i]) {
      return [
        `text ${String(i + 1)} differs: light ${JSON.stringify(a[i] ?? '(none)')}, dark ${JSON.stringify(b[i] ?? '(none)')}`,
      ]
    }
  }
  return []
}

let failed = false
const report = (label, problems) => {
  if (problems.length === 0) {
    console.log(`ok    ${label}`)
    return
  }
  failed = true
  for (const problem of problems) {
    console.log(`FAIL  ${label}: ${problem}`)
  }
}

const contents = new Map()
for (const file of files) {
  try {
    contents.set(file, readFileSync(file, 'utf8'))
  } catch (error) {
    report(file, [`cannot be read (${error.code ?? String(error)})`])
  }
}

for (const [file, svg] of contents) {
  report(file, checkFile(svg))
}

for (const [file, svg] of contents) {
  const match = /^(.*)-light\.svg$/.exec(basename(file))
  if (match === null) {
    continue
  }
  const darkFile = join(dirname(file), `${match[1]}-dark.svg`)
  const dark = [...contents].find(([other]) => join(dirname(other), basename(other)) === darkFile)
  if (dark !== undefined) {
    report(`${file} + ${dark[0]}`, checkPair(svg, dark[1]))
  }
}

process.exit(failed ? 1 : 0)
