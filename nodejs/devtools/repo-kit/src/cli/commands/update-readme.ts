import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import type { ProjectManifest } from '@pnpm/types'
import { Command } from 'commander'
import { execa } from 'execa'
import grayMatter from 'gray-matter'

interface PackageMeta {
  /**
   * Manifest for the package (i.e. contents of its package.json)
   */
  manifest: ProjectManifest

  /**
   * Name of the package
   */
  name: string

  /**
   * Absolute path of the package
   */
  path: string
}

/**
 * Finds all packages in the monorepo, and returns their name and path.
 */
const findPackages = async ({
  includeRoot = false,
}: {
  /**
   * Whether the root package should be included or not.
   * @defaultValue false
   */
  includeRoot?: boolean
} = {}): Promise<PackageMeta[]> => {
  const { stdout } = await execa({
    encoding: 'utf8',
  })`pnpm list -r --depth -1 --json`

  const rootPath = await findWorkspaceRoot()
  const allPackages = JSON.parse(stdout) as { name: string; path: string }[]
  const packages =
    includeRoot ? allPackages : (
      allPackages.filter((pkg) => pkg.path !== rootPath)
    )

  return Promise.all(
    packages.map(async (pkg) => {
      const manifestPath = path.resolve(pkg.path, 'package.json')
      const manifest = JSON.parse(
        await fs.promises.readFile(manifestPath, 'utf-8'),
      ) as ProjectManifest
      return {
        manifest,
        name: pkg.name,
        path: pkg.path,
      }
    }),
  )
}

const findWorkspaceRoot = async (): Promise<string> => {
  const root = await findWorkspaceDir(process.cwd())
  if (!root) {
    throw new Error(
      `Could not determine workspace root. [cwd=${process.cwd()}]`,
    )
  }

  return root
}

/**
 * Given the metadata for a single package, determine it's description.
 */
const getPackageDescription = async (pkg: PackageMeta): Promise<string> => {
  const readmePath = path.join(pkg.path, 'README.md')
  let readme: string

  try {
    readme = await fs.promises.readFile(readmePath, 'utf8')
  } catch {
    // no README - skip to pkg.manifest.description or fallback
    return pkg.manifest.description ?? 'No description provided.'
  }

  // First try to parse front-matter
  const { data, content: body } = grayMatter(readme)
  if (typeof data.summary === 'string' && data.summary.trim().length > 0) {
    return data.summary.trim()
  }

  // If no front-matter, use metadata (description) from package.json
  if (pkg.manifest.description && pkg.manifest.description.trim().length > 0) {
    return pkg.manifest.description.trim()
  }

  // Otherwise, try to use the first paragraph of the README
  const paragraphs = body
    .split(/\r?\n\s*\r?\n/) // split on blank lines
    .map((p) => p.replace(/\r?\n/g, ' ').trim())
    .filter((p) => p.length > 0)

  const firstNonHeader = paragraphs.find((p) => !/^#{1,6}\s/.test(p))
  if (firstNonHeader && firstNonHeader.trim().length > 0) {
    return firstNonHeader.trim()
  }

  // ultimate fallback
  return 'No description provided.'
}

/**
 * Gets a list of summaries -- (name, description) pairs -- for all packages.
 */
const getPackageSummaries = async (): Promise<
  {
    description: string
    link: string
    name: string
  }[]
> => {
  const packages = await findPackages()
  const root = await findWorkspaceRoot()

  return Promise.all(
    packages.map(async (pkg) => {
      return {
        description: await getPackageDescription(pkg),
        link: `./${path.relative(root, pkg.path)}`,
        name: pkg.name,
      }
    }),
  )
}

const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Updates a section of a markdown file by looking for specific 'marker' comments, and replacing the content between
 * them with new text. If the marker is found multiple times in the file, _all_ occurrences will be replaced.
 *
 * @returns true if any changes were made, false otherwise
 */
const updateMarkdownFile = async ({
  content,
  file,
  markerText,
  missing = 'insert',
}: {
  /**
   * Updated content for the section
   */
  content: string

  /**
   * Path to the markdown file to update, relative to the monorepo root.
   */
  file: string

  /**
   * Marker text used to locate the section where content should be updated. Will look for a section like the following:
   *
   * ```
   * <!-- BEGIN <markerText> -->
   * anything between these comments will be replaced
   * and new content will be here when the function returns
   * <!-- END <markerText> -->
   * ```
   */
  markerText: string

  /**
   * What to do if the file *or* the section is missing.
   *
   * - error: throw an error
   * - insert: create the file if needed, and append markers+content if the section isn't found
   * - skip: do nothing, return false
   */
  missing?: 'error' | 'insert' | 'skip'
}): Promise<boolean> => {
  const getUpdatedContent = () => {
    const beginMarker = `<!-- BEGIN ${markerText} -->`
    const endMarker = `<!-- END ${markerText} -->`
    const sectionRegExp = new RegExp(
      `${escapeRegExp(beginMarker)}[\\s\\S]*?${escapeRegExp(endMarker)}`,
      'g',
    )

    const sectionExists = !!sectionRegExp.exec(originalContent)
    if (sectionExists) {
      // section exists, so let's update it
      return originalContent.replaceAll(
        sectionRegExp,
        `${beginMarker}\n${content}\n${endMarker}`,
      )
    } else {
      switch (missing) {
        case 'insert':
          return `${originalContent}\n${beginMarker}\n${content}\n${endMarker}\n`
        case 'skip':
          return originalContent
        default:
          throw new Error(
            `Could not find section to update, and 'missing' was "${missing}. [markerText=${markerText}]`,
          )
      }
    }
  }

  const root = await findWorkspaceRoot()
  const filePath = path.resolve(root, file)

  const fileExists = fs.existsSync(filePath)
  if (!fileExists) {
    if (missing === 'skip') {
      return false
    } else if (missing === 'error') {
      throw new Error(
        `Could not find file to update, and missing was "${missing}. [filePath=${filePath}]`,
      )
    }
  }

  const originalContent =
    fileExists ? await fs.promises.readFile(filePath, 'utf-8') : ''

  const updatedContent = getUpdatedContent()

  // only write new content if it changed
  if (updatedContent !== originalContent) {
    await fs.promises.writeFile(file, updatedContent, 'utf-8')
    return true
  } else {
    return false
  }
}

const handler = async () => {
  const root = await findWorkspaceRoot()
  const packages = await getPackageSummaries()
  const content = packages
    .map((pkg) => {
      return `- [${pkg.name}](${pkg.link}): ${pkg.description}`
    })
    .join('\n')

  await updateMarkdownFile({
    content,
    file: 'README.md',
    markerText: 'repo-kit: PACKAGES',
  })
}

export const makeCommand = () =>
  new Command('update-readme')
    .description(
      'updates the project README.md file to include updated descriptions of all packages',
    )
    .action(handler)
