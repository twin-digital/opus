// `stubViewTools` gives a view the prop `wishem` with no hub. It records each call.
// Usage: node stub-view-tools.mjs
// This file is the package '@thrashplay/wishem-renderer-react', after its build.
import { stubViewTools } from '../../../renderer-react/dist/index.js'

const { tools, calls } = stubViewTools()
console.log('setField:', JSON.stringify(await tools.setField('title', 'Wishem studio')))
console.log('submit:', JSON.stringify(await tools.submit({ type: 'time/set-running', payload: { running: false } })))
console.log('calls:', JSON.stringify(calls))

const refused = stubViewTools({ ok: false, reason: 'not-running', problems: [] })
console.log('refused:', JSON.stringify(await refused.tools.setField('title', 'x')))
