// The names of props, the warnings for bad names, and the generator of the prop types.
// Usage: node names-and-types.mjs <empty folder for the generated files>
// This file is the package '@thrashplay/wishem-renderer-react', after its build.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  collectViews,
  describeWarning,
  fieldName,
  propNames,
  viewWarnings,
} from '../../../renderer-react/dist/index.js'
import { generateViewTypes, viewTypesLines } from '../../../renderer-react/dist/view-types.js'

const folder = process.argv[2]
if (folder === undefined) {
  console.error('usage: node names-and-types.mjs <folder>')
  process.exit(1)
}

for (const label of ['Max health', 'title', '???', '2nd try', 'wishem']) {
  console.log(`label ${JSON.stringify(label)} gives the name ${JSON.stringify(fieldName(label))}`)
}

const TASK = 'ct_8e2f3a41-5b6c-4d7e-9f80-1b2c3d4e5f60'
const LIST = 'ct_7d1e2f30-4a5b-4c6d-8e9f-0a1b2c3d4e5f'
const BAD = 'ct_9f3a4b52-6c7d-4e8f-8a91-2c3d4e5f6071'
const definitions = [
  {
    id: TASK,
    label: 'Task',
    fields: [
      { id: 'fld_4d5e6f7a-8b9c-4d0e-9f1a-3b4c5d6e7f80', label: 'Title', type: 'string' },
      { id: 'fld_5e6f7a8b-9c0d-4e1f-8a2b-4c5d6e7f8091', label: 'Done', type: 'boolean' },
      { id: 'fld_6f7a8b9c-0d1e-4f2a-9b3c-5d6e7f809102', label: 'Points', type: 'number' },
    ],
  },
  {
    id: LIST,
    label: 'List',
    fields: [
      { id: 'fld_1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', label: 'Heading', type: 'string' },
      { id: 'fld_2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e', label: 'First', type: 'reference' },
    ],
  },
  {
    id: BAD,
    label: 'Bad',
    fields: [
      { id: 'fld_a1000000-0000-4000-8000-000000000001', label: 'Max health', type: 'number' },
      { id: 'fld_a1000000-0000-4000-8000-000000000002', label: 'max-health', type: 'number' },
      { id: 'fld_a1000000-0000-4000-8000-000000000003', label: 'wishem', type: 'string' },
      { id: 'fld_a1000000-0000-4000-8000-000000000004', label: '???', type: 'string' },
    ],
  },
]

console.log('--- the props of the type Bad')
console.log(JSON.stringify(propNames(definitions[2]).props.map(({ name }) => name)))
console.log(JSON.stringify(propNames(definitions[2]).problems.map(({ kind }) => kind)))

console.log('--- the warnings of the renderer')
const views = collectViews(
  { './Bad.view.json': { default: { kind: 'react', componentType: BAD } } },
  { './Bad.tsx': { default: () => null } },
)
for (const warning of viewWarnings(views, definitions)) {
  console.log(describeWarning(warning))
}

console.log('--- the generator')
await mkdir(folder, { recursive: true })
for (const [name, componentType] of [
  ['Task', TASK],
  ['List', LIST],
]) {
  await writeFile(join(folder, `${name}.view.json`), JSON.stringify({ kind: 'react', componentType }))
}
const command = 'node names-and-types.mjs <folder>'
viewTypesLines(await generateViewTypes({ definitions, views: folder, command })).forEach((line) => console.log(line))
console.log('--- List.view.gen.ts')
console.log(await readFile(join(folder, 'List.view.gen.ts'), 'utf8'))
console.log('--- the generator again, and a sidecar for the type Bad')
await writeFile(join(folder, 'Bad.view.json'), JSON.stringify({ kind: 'react', componentType: BAD }))
viewTypesLines(await generateViewTypes({ definitions, views: folder, command })).forEach((line) => console.log(line))
