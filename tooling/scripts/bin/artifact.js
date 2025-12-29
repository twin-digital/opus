import fs from 'node:fs'
import path from 'node:path'
import { $ } from '../lib/shell.js'

const contextPath = process.cwd()
const dockerfilePath = path.join(process.cwd(), 'Dockerfile')
const hasDockerfile = fs.existsSync(dockerfilePath)

if (hasDockerfile) {
  const outDir = path.join(process.cwd(), '.out')
  const iidFile = path.join(outDir, 'image.iid')
  const archive = path.join(outDir, 'container-image.tar.gz')

  fs.mkdirSync(path.join(process.cwd(), '.out'), { recursive: true })
  $`docker buildx build --progress plain --load --iidfile "${iidFile}" -f ${dockerfilePath} ${contextPath}`

  const imageId = fs.readFileSync(iidFile, 'utf8').trim()
  $`docker save "${imageId}" | gzip -9 > "${archive}"`
}
