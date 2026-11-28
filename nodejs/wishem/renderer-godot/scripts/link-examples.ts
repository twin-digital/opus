import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { examples } from '@thrashplay/wishem-hub/link/examples'

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(packageDir, 'godot', 'tests', 'fixtures', 'link-examples.json')

writeFileSync(target, `${JSON.stringify(examples, null, 2)}\n`)
console.log(`Wrote ${target}`)
