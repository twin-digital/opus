#!/usr/bin/env node
import { mkdir, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { setTimeout } from 'node:timers/promises'

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

/**
 * How many times to try a single sample before giving up on it.
 */
const Attempts = 3

/**
 * Base delay between attempts, multiplied by the attempt number.
 */
const RetryDelayMs = 500

/**
 * How one sample's download turned out. `missing` means the asset index has no such sample; `failed` means it does,
 * but the download would not complete.
 */
type SampleOutcome = 'downloaded' | 'failed' | 'missing' | 'skipped'

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

const fetchObject = async (name: string, object: { hash: string; size: number }, file: string) => {
  const response = await fetch(`${ResourceBaseUrl}/${object.hash.slice(0, 2)}/${object.hash}`)
  if (!response.ok) {
    throw new Error(`Download failed. [sample=${name}, status=${response.status}]`)
  }

  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.byteLength !== object.size) {
    throw new Error(`Download was truncated. [sample=${name}, expected=${object.size}, received=${bytes.byteLength}]`)
  }

  // Written under a temporary name and renamed into place, because a sample is considered downloaded purely by
  // existing. A process killed mid-write would otherwise leave a partial file that every later run skips, and that
  // fails to decode at play time — a permanently dead key with no way to notice.
  await mkdir(dirname(file), { recursive: true })
  const partial = `${file}.part`
  await writeFile(partial, bytes)
  await rename(partial, file)
}

const downloadSample = async (name: string, index: AssetIndex, directory: string): Promise<SampleOutcome> => {
  const file = join(directory, `${name}.${SampleFileExtension}`)
  if (await exists(file)) {
    return 'skipped'
  }

  const object = index.objects[`minecraft/sounds/${name}.${SampleFileExtension}`]
  if (object === undefined) {
    log.warn(`Sample is not in this version's asset index. [sample=${name}]`)
    return 'missing'
  }

  for (let attempt = 1; ; attempt++) {
    try {
      await fetchObject(name, object, file)
      return 'downloaded'
    } catch (error) {
      if (attempt === Attempts) {
        // One sample's failure is not the run's: the rest still download, the summary still prints, and the exit
        // status reports that something is missing. Re-running picks up only what is absent.
        log.warn(`Giving up on a sample. [sample=${name}, attempts=${Attempts}, error=${String(error)}]`)
        return 'failed'
      }

      await setTimeout(RetryDelayMs * attempt)
    }
  }
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
  const counts: Record<SampleOutcome, number> = { downloaded: 0, failed: 0, missing: 0, skipped: 0 }
  const unusable: string[] = []

  const worker = async () => {
    for (let name = remaining.pop(); name !== undefined; name = remaining.pop()) {
      const outcome = await downloadSample(name, index, directory)
      counts[outcome] += 1
      if (outcome !== 'downloaded' && outcome !== 'skipped') {
        unusable.push(name)
      }
    }
  }

  await Promise.all(Array.from({ length: Concurrency }, worker))

  log.info(
    `Sound-board samples are in ${directory}. [downloaded=${counts.downloaded}, already present=${counts.skipped}, not in the asset index=${counts.missing}, failed to download=${counts.failed}]`,
  )

  if (unusable.length > 0) {
    // A non-zero status, so a scripted setup does not go green over a board with dead keys. A sample missing from the
    // index usually means it was renamed or removed in a later game version: pin MINECRAFT_VERSION to an older one.
    log.error(`These samples could not be fetched, and their keys will be silent: ${unusable.sort().join(', ')}`)
    process.exitCode = 1
  }
}

await main()
