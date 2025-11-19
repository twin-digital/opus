import fs from 'node:fs'
import path from 'node:path'
import { Command } from 'commander'
import grayMatter from 'gray-matter'
import { findPackages } from '../../workspace/find-packages.js'
import { getWorkspaceRoot } from '../../workspace/get-workspace-root.js'
import { updateSection } from '../../markdown/update-section.js'
import type { PackageMeta } from '../../workspace/package-meta.js'

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
  const root = await getWorkspaceRoot()

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

const handler = async () => {
  const packages = await getPackageSummaries()
  const content = packages
    .map((pkg) => {
      return `- [${pkg.name}](${pkg.link}): ${pkg.description}`
    })
    .join('\n')

  const root = await getWorkspaceRoot()
  const filePath = path.resolve(root, 'README.md')
  const fileExists = fs.existsSync(filePath)
  const readme = fileExists ? await fs.promises.readFile(filePath, 'utf-8') : ''

  const newReadme = await updateSection({
    content,
    markdown: readme,
    sectionId: 'repo-kit: PACKAGES',
  })

  if (readme !== newReadme) {
    await fs.promises.writeFile(filePath, newReadme, 'utf-8')
  }
}

export const makeCommand = (): Command =>
  new Command('update-readme')
    .description('updates the project README.md file to include updated descriptions of all packages')
    .action(handler)
