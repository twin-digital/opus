import fs from 'node:fs'
import path from 'node:path'
import { $ } from '../lib/util/shell.js'

const findMonorepoRoot = (startDir) => {
  let dir = startDir
  // Walk up until we find a workspace marker or git root
  while (true) {
    if (
      fs.existsSync(path.join(dir, 'pnpm-workspace.yaml')) ||
      fs.existsSync(path.join(dir, 'pnpm-workspace.yml')) ||
      fs.existsSync(path.join(dir, '.git'))
    ) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) return startDir
    dir = parent
  }
}

const repoRoot = findMonorepoRoot(process.cwd())
const dockerfilePath = path.join(process.cwd(), 'Dockerfile')
const hasDockerfile = fs.existsSync(dockerfilePath)

if (hasDockerfile) {
  const outDir = path.join(process.cwd(), '.out')
  const iidFile = path.join(outDir, 'image.iid')
  const archive = path.join(outDir, 'container-image.tar.gz')

  fs.mkdirSync(path.join(process.cwd(), '.out'), { recursive: true })
  $`docker buildx build --progress plain --load --iidfile "${iidFile}" -f ${dockerfilePath} ${repoRoot}`

  const imageId = fs.readFileSync(iidFile, 'utf8').trim()
  $`docker save "${imageId}" | gzip -9 > "${archive}"`
}
