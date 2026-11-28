// Shows the features of the milestone A4 that only a program can use.
// Usage, from the root of the repository, after the build: node nodejs/wishem/docs/milestones/a4-workbench/library-features.mjs
import { readFileSync } from 'node:fs'
import { createStore, storeInputs } from '../../../core/dist/index.js'
import { createHub } from '../../../hub/dist/index.js'
import { createTime, timeInputs } from '../../../clock/dist/index.js'
import { createUpdate } from '../../../update/dist/index.js'
import { behaviors } from '../../../sample-product/dist/index.js'
import { productChanges } from '../../../construct-manager/dist/index.js'

const model = () => {
  const folder = new URL(`../../../sample-product/model/`, import.meta.url)
  const definitions = ['ct_6af38bd9-a91d-49d9-9370-fa4e6c04769d', 'ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512'].map((id) =>
    JSON.parse(readFileSync(new URL(`definitions/${id}.json`, folder), 'utf8')),
  )
  return { definitions, entities: JSON.parse(readFileSync(new URL('state.json', folder), 'utf8')).entities }
}

// 1. The update subsystem runs the behaviors of the sample product at each tick.
const base = model()
const hub = createHub({ subsystems: [createTime(), createUpdate({ store: createStore({ model: base }), behaviors })] })
hub.start()
const controls = hub.attach({ id: 'controls', kind: 'input' })
for (let tick = 1; tick <= 2; tick++) {
  await controls.submit(timeInputs.advance(50))
  const [entity] = hub.read().store.entities
  const [color, count] = [Object.values(entity.components)[0], Object.values(entity.components)[1]]
  console.log(`1. tick ${tick}:`, JSON.stringify(Object.values(color)), JSON.stringify(Object.values(count)))
}

// 2. A list of references, a clear of a field, and a store that keeps the array of the caller.
const DECK = 'ct_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CARDS = 'fld_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const [A, B] = ['e_11111111-1111-4111-8111-111111111111', 'e_22222222-2222-4222-8222-222222222222']
const deckModel = {
  definitions: [{ id: DECK, label: 'Deck', fields: [{ id: CARDS, label: 'Cards', type: 'reference-list' }] }],
  entities: [
    { id: A, components: { [DECK]: { [CARDS]: [B] } } },
    { id: B, components: { [DECK]: {} } },
  ],
}
const inputs = storeInputs('store')
const deckHub = createHub({ subsystems: [createStore({ model: deckModel })] })
deckHub.start()
const deck = deckHub.attach({ id: 'deck', kind: 'input' })
const cards = () => JSON.stringify(deckHub.read().store.entities[0].components[DECK][CARDS])
const entityRef = { entity: A, componentType: DECK, field: CARDS }
await deck.submit(inputs.addReference({ ...entityRef, reference: A }))
console.log('2. add-reference:', cards())
await deck.submit(inputs.removeReference({ ...entityRef, reference: B }))
console.log('2. remove-reference:', cards())
await deck.submit(inputs.clearField(entityRef))
console.log('2. clear-field:', cards())
const mine = [B]
await deck.submit(inputs.setField({ ...entityRef, value: mine }))
console.log('2. the array of the caller is frozen:', Object.isFrozen(mine))

// 3. The inputs that change a store from one product model to the next keep the entities that stay.
const after = { ...base, entities: [...base.entities, { id: B, components: {} }] }
console.log('3. productChanges:', JSON.stringify(productChanges(base, after, 'product').map((input) => input.type)))
