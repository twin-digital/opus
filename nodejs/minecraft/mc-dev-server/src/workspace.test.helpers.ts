/** Builds a pack-bearing pnpm workspace on disk, so discovery runs against a real one. */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/** One pack package the scratch workspace holds. */
export interface ScratchPack {
  packageName: string
  dir: string
  uuid: string
  moduleUuid: string
  version?: string
  /** package scripts the harness would run */
  scripts?: Record<string, string>
  /** whether the built output tree is present */
  built?: boolean
}

export interface ScratchWorkspace {
  root: string
  /** the absolute built-output directory of a pack */
  outputDir(pack: ScratchPack): string
  write(relative: string, content: string): Promise<void>
  remove(): Promise<void>
}

const put = async (path: string, content: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf8')
}

const manifestFor = (pack: ScratchPack): string =>
  JSON.stringify(
    {
      format_version: 2,
      header: { description: 'scratch', uuid: pack.uuid, min_engine_version: [1, 21, 0] },
      modules: [{ type: 'script', language: 'javascript', uuid: pack.moduleUuid }],
    },
    undefined,
    2,
  )

/** Stands up the workspace and returns it; the caller removes it. */
export const createScratchWorkspace = async (packs: readonly ScratchPack[]): Promise<ScratchWorkspace> => {
  const root = await mkdtemp(join(tmpdir(), 'mc-dev-server-ws-'))
  await put(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n")
  await put(join(root, 'package.json'), JSON.stringify({ name: 'scratch-workspace', private: true }, undefined, 2))

  for (const pack of packs) {
    const packageDir = join(root, pack.dir)
    await put(
      join(packageDir, 'package.json'),
      JSON.stringify(
        {
          name: pack.packageName,
          version: pack.version ?? '1.0.0',
          ...(pack.scripts ? { scripts: pack.scripts } : {}),
        },
        undefined,
        2,
      ),
    )
    await put(join(packageDir, 'behavior_pack', 'manifest.json'), manifestFor(pack))
    if (pack.built !== false) {
      await put(join(packageDir, 'dist', 'behavior_pack', 'manifest.json'), manifestFor(pack))
      await put(join(packageDir, 'dist', 'behavior_pack', 'scripts', 'main.js'), 'export {}\n')
    }
  }

  return {
    root,
    outputDir: (pack) => join(root, pack.dir, 'dist', 'behavior_pack'),
    write: (relative, content) => put(join(root, relative), content),
    remove: () => rm(root, { recursive: true, force: true }),
  }
}

/** A pack the scratch workspace can hold. */
export const scratchPack = (index: number, overrides: Partial<ScratchPack> = {}): ScratchPack => ({
  packageName: `@scratch/pack-${String(index)}`,
  dir: `packages/pack-${String(index)}`,
  uuid: `a${String(index)}111111-1111-4111-8111-111111111111`,
  moduleUuid: `b${String(index)}111111-1111-4111-8111-111111111111`,
  ...overrides,
})
