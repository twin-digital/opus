import fs from 'node:fs'
import path from 'node:path'
import { $ } from '../lib/shell.js'
import { requireDocker } from '../lib/require-docker.js'

// The Docker build context must be the monorepo root so a package's Dockerfile can
// `turbo prune` against the full workspace + lockfile; the Dockerfile itself lives in the
// package dir, and the build artifact (.out) is written there for the publish workflow.
const findWorkspaceRoot = (start) => {
  let dir = start
  for (;;) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return start
    dir = parent
  }
}

const packageDir = process.cwd()
const contextPath = findWorkspaceRoot(packageDir)
const dockerfilePath = path.join(packageDir, 'Dockerfile')
const hasDockerfile = fs.existsSync(dockerfilePath)

if (hasDockerfile) {
  requireDocker()

  const outDir = path.join(packageDir, '.out')
  const iidFile = path.join(outDir, 'image.iid')
  const archive = path.join(outDir, 'container-image.tar.gz')

  fs.mkdirSync(outDir, { recursive: true })
  $`docker buildx build --progress plain --load --iidfile "${iidFile}" -f ${dockerfilePath} ${contextPath}`

  const imageId = fs.readFileSync(iidFile, 'utf8').trim()
  $`docker save "${imageId}" | gzip -9 > "${archive}"`
}
