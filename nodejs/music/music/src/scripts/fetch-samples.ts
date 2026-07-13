#!/usr/bin/env node
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { getSampleDirectory } from '../audio/sample-directory.js'
import { SampleFileExtension } from '../audio/sample-store.js'
import { logger } from '../logger.js'
import { SoundBoardSampleNames } from '../soundboard/sound-boards.js'

const log = logger.child({}, { msgPrefix: '[SAMPLES] ' })

const VersionManifestUrl = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
const ResourceBaseUrl = 'https://resources.download.minecraft.net'

/**
 * Number of samples to download at once.
 */
const Concurrency = 8

interface AssetIndex {
  objects: Record<string, { hash: string; size: number } | undefined>
}

interface VersionManifest {
  latest: { release: string }
  versions: { id: string; url: string }[]
}

const getJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Request failed. [url=${url}, status=${response.status}]`)
  }

  return response.json() as Promise<T>
}

/**
 * Fetches the asset index for a Minecraft version — the latest release unless one is named. The index maps a game
 * asset's logical name to the content hash it is stored under, which is how the game's own launcher finds its files.
 */
const getAssetIndex = async (version?: string): Promise<AssetIndex> => {
  const manifest = await getJson<VersionManifest>(VersionManifestUrl)
  const id = version ?? manifest.latest.release
  const entry = manifest.versions.find((candidate) => candidate.id === id)
  if (entry === undefined) {
    throw new Error(`No such Minecraft version. [version=${id}]`)
  }

  log.info(`Reading the asset index for Minecraft ${id}.`)

  const { assetIndex } = await getJson<{ assetIndex: { url: string } }>(entry.url)
  return getJson<AssetIndex>(assetIndex.url)
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  )

const downloadSample = async (name: string, index: AssetIndex, directory: string) => {
  const file = join(directory, `${name}.${SampleFileExtension}`)
  if (await exists(file)) {
    return 'skipped' as const
  }

  const object = index.objects[`minecraft/sounds/${name}.${SampleFileExtension}`]
  if (object === undefined) {
    log.warn(`Sample is not in this version's asset index. [sample=${name}]`)
    return 'missing' as const
  }

  const response = await fetch(`${ResourceBaseUrl}/${object.hash.slice(0, 2)}/${object.hash}`)
  if (!response.ok) {
    throw new Error(`Download failed. [sample=${name}, status=${response.status}]`)
  }

  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, Buffer.from(await response.arrayBuffer()))
  return 'downloaded' as const
}

/**
 * Downloads the samples the sound boards reference, from Mojang's asset servers into the sample directory. Samples
 * already on disk are left alone, so re-running only fetches what is new.
 *
 * The audio is Mojang's, and is not redistributed with this package: it is downloaded on the machine that plays it,
 * from the same servers the game itself uses.
 */
const main = async () => {
  const directory = getSampleDirectory()
  const index = await getAssetIndex(process.env.MINECRAFT_VERSION)

  const remaining = [...SoundBoardSampleNames]
  const counts = { downloaded: 0, missing: 0, skipped: 0 }

  const worker = async () => {
    for (let name = remaining.pop(); name !== undefined; name = remaining.pop()) {
      counts[await downloadSample(name, index, directory)] += 1
    }
  }

  await Promise.all(Array.from({ length: Concurrency }, worker))

  log.info(
    `Sound-board samples are ready in ${directory}. [downloaded=${counts.downloaded}, already present=${counts.skipped}, unavailable=${counts.missing}]`,
  )
}

await main()
