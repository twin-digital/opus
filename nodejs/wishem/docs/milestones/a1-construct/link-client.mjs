// A client of the link, made with the library of the hub.
// Usage: node link-client.mjs [--url <address>] [--title <text>] [--label <text>] [--json] [--once]
//   --title  sends store/set-field for the title of the first entity
//   --label  sends store/replace-model with a new label on the first component type
//   --json   prints the full part `store` and not a summary
//   --once   stops after the first input, or after the first state when there is no input
import { parseArgs } from 'node:util'
// This file is the package '@thrashplay/wishem-hub', after its build.
import { openLink, webSocketChannel } from '../../../hub/dist/index.js'

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'ws://127.0.0.1:4747/link' },
    title: { type: 'string' },
    label: { type: 'string' },
    json: { type: 'boolean', default: false },
    once: { type: 'boolean', default: false },
  },
})

// One line: the component types, then each entity with its values.
const summarize = (model) => {
  if (values.json) {
    return JSON.stringify(model)
  }
  const types = model.definitions.map((definition) => definition.label).join(', ')
  const entities = model.entities.map((entity) => {
    const components = Object.entries(entity.components).map(([typeId, component]) => {
      const definition = model.definitions.find((candidate) => candidate.id === typeId)
      const fields = Object.entries(component).map(([fieldId, value]) => {
        const field = definition?.fields.find((candidate) => candidate.id === fieldId)
        return `${field?.label ?? fieldId}=${JSON.stringify(value)}`
      })
      return `${definition?.label ?? typeId}{${fields.join(', ')}}`
    })
    return `${entity.id.slice(0, 10)} ${components.join(' ')}`
  })
  return `types: ${types} | entities: ${entities.join('; ')}`
}

const id = process.pid
const channel = await webSocketChannel(new WebSocket(values.url))
const link = await openLink(channel, [
  { id: `reader-${id}`, kind: 'output' },
  { id: `sender-${id}`, kind: 'input' },
])
const reader = link.ports[`reader-${id}`]
const sender = link.ports[`sender-${id}`]
console.log('state:', summarize(reader.read().store))

reader.subscribe((event) => {
  if (event.type === 'applied') {
    console.log(`applied #${event.input.seq} ${event.input.type} from ${event.input.source}`)
    console.log('state:', summarize(reader.read().store))
  }
})

const model = reader.read().store
let input
if (values.title !== undefined) {
  const entity = model.entities[0]
  const [componentType] = Object.keys(entity.components)
  const [field] = Object.keys(entity.components[componentType])
  input = { type: 'store/set-field', payload: { entity: entity.id, componentType, field, value: values.title } }
} else if (values.label !== undefined) {
  const [first, ...others] = model.definitions
  input = {
    type: 'store/replace-model',
    payload: { model: { ...model, definitions: [{ ...first, label: values.label }, ...others] } },
  }
}
if (input !== undefined) {
  console.log('result:', JSON.stringify(await sender.submit(input)))
}

if (values.once) {
  // Wait a moment so that the line of the event prints.
  setTimeout(() => link.close(), 200)
}
process.on('SIGINT', () => link.close())
await link.closed
console.log('link closed')
