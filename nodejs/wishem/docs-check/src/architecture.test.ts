import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { architectureFolder, renderScript } from './index.js'

const wishemFolder = join(architectureFolder, '..', '..')
const tokensPath = join('workbench-app', 'src', 'styles', 'tokens.css')

interface Manifest {
  name: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

const tmpFolders: string[] = []

afterEach(() => {
  for (const folder of tmpFolders.splice(0)) {
    rmSync(folder, { recursive: true, force: true })
  }
})

const run = (script: string, args: string[]) => {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

/** Returns the text of the card of a package in a package view: the lines below its name, joined with a space. */
const cardText = (svg: string, name: string) => {
  const texts = [...svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"[^>]*font-weight="(\d+)"[^>]*>([^<]*)<\/text>/g)].map(
    (match) => ({ x: Number(match[1]), y: Number(match[2]), weight: match[3], text: match[4] }),
  )
  const title = texts.find((entry) => entry.weight === '600' && entry.text === name)
  if (title === undefined) {
    throw new Error(`no card for ${name}`)
  }
  return texts
    .filter((entry) => entry.x === title.x && entry.y > title.y && entry.y < title.y + 100 && entry.weight !== '600')
    .map((entry) => entry.text)
    .join(' ')
}

/** A copy of the manifests and of the architecture folder. `withSvg: false` leaves out the SVG files. */
const makeFixture = ({ withSvg = true } = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'wishem-docs-check-'))
  tmpFolders.push(root)
  const packages = join(root, 'packages')
  const out = join(root, 'out')
  mkdirSync(out)
  for (const entry of readdirSync(wishemFolder, { withFileTypes: true })) {
    const manifest = join(wishemFolder, entry.name, 'package.json')
    if (entry.isDirectory() && existsSync(manifest)) {
      mkdirSync(join(packages, entry.name), { recursive: true })
      cpSync(manifest, join(packages, entry.name, 'package.json'))
    }
  }
  for (const file of readdirSync(architectureFolder)) {
    if (file === 'README.md' || (withSvg && file.endsWith('.svg'))) {
      cpSync(join(architectureFolder, file), join(out, file))
    }
  }
  const manifestPath = (folder: string) => join(packages, folder, 'package.json')
  return {
    root,
    packages,
    out,
    manifestPath,
    readManifest: (folder: string) => JSON.parse(readFileSync(manifestPath(folder), 'utf8')) as Manifest,
    writeManifest: (folder: string, manifest: Manifest) => {
      mkdirSync(join(packages, folder), { recursive: true })
      writeFileSync(manifestPath(folder), `${JSON.stringify(manifest, null, 2)}\n`)
    },
    render: (extra: string[] = [], script = renderScript) =>
      run(script, ['--packages', packages, '--out', out, ...extra]),
    read: (file: string) => readFileSync(join(out, file), 'utf8'),
    files: () => readdirSync(out).sort(),
  }
}

const dependency = (name: string) => `@thrashplay/wishem-${name}`

/** A copy of `render.mjs` with a patched text, in a folder tree that holds the tokens of the checkout. */
const patchedScript = (root: string, from: string, to: string) => {
  const source = readFileSync(renderScript, 'utf8')
  expect(source).toContain(from)
  const folder = join(root, 'nodejs', 'wishem', 'docs', 'architecture')
  mkdirSync(folder, { recursive: true })
  mkdirSync(join(root, 'nodejs', 'wishem', 'workbench-app', 'src', 'styles'), { recursive: true })
  cpSync(join(wishemFolder, tokensPath), join(root, 'nodejs', 'wishem', tokensPath))
  const script = join(folder, 'render.mjs')
  writeFileSync(script, source.replace(from, to))
  return script
}

describe('render.mjs --check, with the real document', () => {
  it('finds each file current', () => {
    const result = run(renderScript, ['--check'])
    expect(result.output).toContain('render: each file is current')
    expect(result.status).toBe(0)
  })
})

describe('the container diagram', () => {
  const svg = readFileSync(join(architectureFolder, 'containers-light.svg'), 'utf8')

  it('shows no package', () => {
    expect(svg).not.toContain('TypeScript package')
  })

  it('shows no import', () => {
    expect(svg).not.toContain('[import]')
  })

  it('names the package of each unit', () => {
    const lines = svg.match(/(?:Package|Example): [a-z-]+/g) ?? []
    expect(lines.sort()).toEqual([
      'Example: sample-product',
      'Package: host-nodejs',
      'Package: pixi-page',
      'Package: pixi-page',
      'Package: renderer-godot',
      'Package: renderer-godot',
      'Package: three-renderers',
      'Package: three-renderers',
      'Package: three-renderers',
      'Package: workbench',
      'Package: workbench-app',
      'Package: workbench-app',
    ])
  })
})

describe('the component diagram of the workbench process', () => {
  for (const theme of ['light', 'dark']) {
    it(`exists (${theme})`, () => {
      expect(existsSync(join(architectureFolder, `components-workbench-process-${theme}.svg`))).toBe(true)
    })
  }

  it('names the nine components', () => {
    const svg = readFileSync(join(architectureFolder, 'components-workbench-process-light.svg'), 'utf8')
    for (const name of [
      'Start script',
      'Vite development server',
      'Workbench construct',
      'Storage subsystems',
      'Construct manager',
      'Product constructs',
      'Update subsystem',
      'Product code',
      'Generator of the view types',
    ]) {
      expect(svg).toContain(name)
    }
  })
})

const arrowPairs = (svg: string) =>
  [...svg.matchAll(/<g class="uses" data-from="([^"]+)" data-to="([^"]+)">/g)]
    .map((match) => `${match[1]} -> ${match[2]}`)
    .sort()

const runtimePairs = (manifests: Manifest[]) =>
  manifests
    .flatMap((manifest) => {
      const from = manifest.name.replace('@thrashplay/wishem-', '')
      return [
        ...new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {})]),
      ]
        .filter((name) => name.startsWith('@thrashplay/wishem-'))
        .map((name) => `${from} -> ${name.replace('@thrashplay/wishem-', '')}`)
    })
    .sort()

const realManifests = () =>
  readdirSync(wishemFolder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(wishemFolder, entry.name, 'package.json')))
    .map((entry) => JSON.parse(readFileSync(join(wishemFolder, entry.name, 'package.json'), 'utf8')) as Manifest)

describe('the arrows of the package dependency view, with the real document', () => {
  const manifests = realManifests()

  for (const theme of ['light', 'dark']) {
    const svg = readFileSync(join(architectureFolder, `packages-${theme}.svg`), 'utf8')

    it(`has one arrow for each runtime dependency, and no other arrow (${theme})`, () => {
      const pairs = arrowPairs(svg)
      expect(pairs.length).toBeGreaterThan(0)
      expect(pairs).toEqual(runtimePairs(manifests))
    })

    it(`has no arrow for a test dependency, and names it in the line Tests with (${theme})`, () => {
      const runtime = new Set(runtimePairs(manifests))
      const pairs = new Set(arrowPairs(svg))
      expect(pairs.size).toBeGreaterThan(0)
      let tested = 0
      for (const manifest of manifests) {
        const from = manifest.name.replace('@thrashplay/wishem-', '')
        for (const name of Object.keys(manifest.devDependencies ?? {})) {
          const to = name.replace('@thrashplay/wishem-', '')
          if (name.startsWith('@thrashplay/wishem-') && !runtime.has(`${from} -> ${to}`)) {
            tested++
            expect(pairs.has(`${from} -> ${to}`)).toBe(false)
          }
        }
      }
      expect(tested).toBeGreaterThan(0)
      expect(cardText(svg, 'host-nodejs')).toContain('Tests with: clock')
      expect(cardText(svg, 'construct-manager')).toContain('Tests with: sample-product')
      expect(cardText(svg, 'docs-check')).toContain('Tests with: each other')
    })

    it(`has no line Uses (${theme})`, () => {
      expect(svg).not.toContain('Uses:')
    })
  }
})

describe('render.mjs, the arrows of the package dependency view', () => {
  it('names the files that a new runtime dependency makes out of date, and writes an arrow without --check', () => {
    const fixture = makeFixture()
    const manifest = fixture.readManifest('renderer-pixi')
    manifest.dependencies = { ...manifest.dependencies, [dependency('clock')]: 'workspace:*' }
    fixture.writeManifest('renderer-pixi', manifest)

    const check = fixture.render(['--check'])
    expect(check.status).toBe(1)
    expect(check.output).toContain('render: packages-light.svg is out of date')
    expect(check.output).toContain('render: packages-dark.svg is out of date')
    expect(check.output).toContain('render: run node nodejs/wishem/docs/architecture/render.mjs')

    const write = fixture.render()
    expect(write.status).toBe(0)
    expect(arrowPairs(fixture.read('packages-light.svg'))).toContain('renderer-pixi -> clock')
    expect(fixture.read('packages-light.svg')).toContain('<g class="uses" data-from="renderer-pixi" data-to="clock">')
    expect(fixture.render(['--check']).status).toBe(0)
  })

  it('draws an arrow for a peer dependency', () => {
    const fixture = makeFixture()
    const manifest = fixture.readManifest('renderer-pixi')
    manifest.peerDependencies = { [dependency('update')]: 'workspace:*' }
    fixture.writeManifest('renderer-pixi', manifest)

    expect(fixture.render().status).toBe(0)
    expect(arrowPairs(fixture.read('packages-light.svg'))).toContain('renderer-pixi -> update')
  })

  it('puts a development dependency in the line Tests with, and draws no arrow', () => {
    const fixture = makeFixture()
    const manifest = fixture.readManifest('renderer-pixi')
    manifest.dependencies = Object.fromEntries(
      Object.entries(manifest.dependencies ?? {}).filter(([name]) => name !== dependency('clock')),
    )
    manifest.devDependencies = { [dependency('clock')]: 'workspace:*' }
    fixture.writeManifest('renderer-pixi', manifest)

    expect(fixture.render().status).toBe(0)
    const svg = fixture.read('packages-light.svg')
    expect(cardText(svg, 'renderer-pixi')).toContain('Tests with: clock')
    expect(arrowPairs(svg)).not.toContain('renderer-pixi -> clock')
  })

  it('accepts a development dependency to a higher layer', () => {
    const fixture = makeFixture()
    const manifest = fixture.readManifest('hub')
    manifest.devDependencies = { [dependency('core')]: 'workspace:*' }
    fixture.writeManifest('hub', manifest)

    const result = fixture.render()
    expect(result.status).toBe(0)
    expect(cardText(fixture.read('packages-light.svg'), 'hub')).toContain('Tests with: core')
  })
})

describe('render.mjs, the checks', () => {
  const expectFailure = (fixture: ReturnType<typeof makeFixture>, line: string, script?: string) => {
    const result = fixture.render([], script)
    expect(result.status).toBe(1)
    expect(result.output).toContain(line)
    expect(fixture.files()).toEqual(['README.md'])
  }

  it('fails for a package with no layer', () => {
    const fixture = makeFixture({ withSvg: false })
    fixture.writeManifest('extra', { name: dependency('extra') })
    expectFailure(fixture, 'render: the package extra has no layer')
    const result = fixture.render()
    expect(result.output).toContain('render: the table of the packages has no row for extra')
    expect(result.output).toContain('render: extra is not a development dependency of docs-check')
  })

  it('fails for a layer with a missing package', () => {
    const fixture = makeFixture({ withSvg: false })
    rmSync(join(fixture.packages, 'clock'), { recursive: true })
    expectFailure(fixture, 'render: the layer "Model and subsystems" names clock, which is not a package')
  })

  it('fails for a package in two layers', () => {
    const fixture = makeFixture({ withSvg: false })
    const script = patchedScript(
      fixture.root,
      "name: 'Hub', packages: ['hub']",
      "name: 'Hub', packages: ['hub', 'core']",
    )
    expectFailure(fixture, 'render: the package core is in two layers', script)
  })

  it('fails for a runtime dependency to a higher layer', () => {
    const fixture = makeFixture({ withSvg: false })
    const manifest = fixture.readManifest('hub')
    manifest.dependencies = { [dependency('core')]: 'workspace:*' }
    fixture.writeManifest('hub', manifest)
    expectFailure(
      fixture,
      'render: hub (layer "Hub") uses core (layer "Model and subsystems"), which is a higher layer',
    )
  })

  it('fails for a missing row of the table', () => {
    const fixture = makeFixture({ withSvg: false })
    const readme = join(fixture.out, 'README.md')
    const lines = readFileSync(readme, 'utf8').split('\n')
    const kept = lines.filter((line) => !/^\| `clock`\s*\|/.test(line))
    expect(kept.length).toBeLessThan(lines.length)
    writeFileSync(readme, kept.join('\n'))
    expectFailure(fixture, 'render: the table of the packages has no row for clock')
  })

  it('fails for a package that is not a development dependency of docs-check', () => {
    const fixture = makeFixture({ withSvg: false })
    const manifest = fixture.readManifest('docs-check')
    manifest.devDependencies = Object.fromEntries(
      Object.entries(manifest.devDependencies ?? {}).filter(([name]) => name !== dependency('clock')),
    )
    fixture.writeManifest('docs-check', manifest)
    expectFailure(fixture, 'render: clock is not a development dependency of docs-check')
  })

  it('fails when the folder name differs from the name field', () => {
    const fixture = makeFixture({ withSvg: false })
    const manifest = fixture.readManifest('clock')
    manifest.name = dependency('clocks')
    fixture.writeManifest('clock', manifest)
    expectFailure(fixture, 'render: the folder clock holds the package @thrashplay/wishem-clocks')
  })

  it('fails for a cycle in one layer', () => {
    const fixture = makeFixture({ withSvg: false })
    const manifest = fixture.readManifest('core')
    manifest.dependencies = { ...manifest.dependencies, [dependency('update')]: 'workspace:*' }
    fixture.writeManifest('core', manifest)
    expectFailure(fixture, 'render: the packages of the layer "Model and subsystems" use one another in a cycle')
  })
})

describe('render.mjs, the checks of the routes', () => {
  const expectRouteFailure = (from: string, to: string, line: RegExp) => {
    const fixture = makeFixture({ withSvg: false })
    const script = patchedScript(fixture.root, from, to)
    const result = fixture.render([], script)
    expect(result.status).not.toBe(0)
    expect(result.output).toMatch(line)
    expect(fixture.files()).toEqual(['README.md'])
  }

  it('fails when two arrows share a line', () => {
    expectRouteFailure(
      'const trackIndex = (',
      'const trackIndex = () => ({ index: 0, insert: false })\nconst unusedTrackIndex = (',
      /The arrows \S+ -> \S+ and \S+ -> \S+ share a line/,
    )
  })

  it('fails when an arrow crosses a card', () => {
    expectRouteFailure(
      'const cardRects = (cards) => cards',
      'const cardRects = (cards) => cards.map((card) => ({ ...card, w: card.w + 90 }))\nconst unusedCardRects = (cards) => cards',
      /The arrow \S+ -> \S+ crosses the card \S+/,
    )
  })

  it('fails when an arrow crosses the label of a band', () => {
    expectRouteFailure(
      'const labelBox = (item) =>',
      'const labelBox = () => ({ x: 0, y: 0, w: 9999, h: 9999 })\nconst unusedLabelBox = (item) =>',
      /The arrow \S+ -> \S+ crosses the label of the layer "[^"]+"/,
    )
  })

  it('fails when an arrow does not go down', () => {
    expectRouteFailure(
      'const arrowEnds = (edge) => [edge.from, edge.to]',
      'const arrowEnds = (edge) => [edge.to, edge.from]',
      /The arrow \S+ -> \S+ does not go down/,
    )
  })
})
