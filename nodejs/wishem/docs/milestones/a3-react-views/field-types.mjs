// The field types `number`, `boolean`, and `reference` in a store. Prints the outcome of each input.
// Usage: node field-types.mjs
// This file is the packages '@thrashplay/wishem-core' and '@thrashplay/wishem-hub', after their build.
import { createStore, validateModel } from '../../../core/dist/index.js'
import { createHub } from '../../../hub/dist/index.js'

const TASK = 'ct_8e2f3a41-5b6c-4d7e-9f80-1b2c3d4e5f60'
const LIST = 'ct_7d1e2f30-4a5b-4c6d-8e9f-0a1b2c3d4e5f'
const TITLE = 'fld_4d5e6f7a-8b9c-4d0e-9f1a-3b4c5d6e7f80'
const DONE = 'fld_5e6f7a8b-9c0d-4e1f-8a2b-4c5d6e7f8091'
const POINTS = 'fld_6f7a8b9c-0d1e-4f2a-9b3c-5d6e7f809102'
const FIRST = 'fld_2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e'
const E_LIST = 'e_a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const E_TASK = 'e_b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e'

const model = {
  definitions: [
    {
      id: TASK,
      label: 'Task',
      fields: [
        { id: TITLE, label: 'Title', type: 'string' },
        { id: DONE, label: 'Done', type: 'boolean' },
        { id: POINTS, label: 'Points', type: 'number' },
      ],
    },
    { id: LIST, label: 'List', fields: [{ id: FIRST, label: 'First', type: 'reference' }] },
  ],
  entities: [
    { id: E_LIST, components: { [LIST]: { [FIRST]: E_TASK } } },
    { id: E_TASK, components: { [TASK]: { [TITLE]: 'Draw the goat', [DONE]: false, [POINTS]: 3 } } },
  ],
}

const show = (label, value) => {
  console.log(`${label}: ${JSON.stringify(value)}`)
}

show('valid model', validateModel(model).ok)
const wrong = structuredClone(model)
wrong.entities[1].components[TASK][POINTS] = 'many'
wrong.entities[0].components[LIST][FIRST] = 'e_00000000-0000-4000-8000-000000000000'
for (const problem of validateModel(wrong).problems ?? []) {
  console.log(`problem: ${problem.message}`)
}

const hub = createHub({ subsystems: [createStore({ model })] })
hub.start()
const input = hub.attach({ id: 'tool', kind: 'input' })
const set = (field, value) =>
  input.submit({ type: 'store/set-field', payload: { entity: E_TASK, componentType: TASK, field, value } })

show('points 5', await set(POINTS, 5))
show('points "5"', await set(POINTS, '5'))
show('points NaN', await set(POINTS, Number.NaN))
show('done true', await set(DONE, true))
show('done "true"', await set(DONE, 'true'))
show(
  'first = nothing',
  await input.submit({
    type: 'store/set-field',
    payload: { entity: E_LIST, componentType: LIST, field: FIRST, value: 'e_00000000-0000-4000-8000-000000000000' },
  }),
)
show('remove the held task', await input.submit({ type: 'store/remove-entity', payload: { entity: E_TASK } }))
show('remove the list', await input.submit({ type: 'store/remove-entity', payload: { entity: E_LIST } }))
show('then remove the task', await input.submit({ type: 'store/remove-entity', payload: { entity: E_TASK } }))
hub.stop()
