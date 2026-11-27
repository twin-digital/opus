// Usage: node board.mjs <item id>=<todo|progress|blocked|done> ...
import { execFileSync } from 'node:child_process'

const options = { todo: 'd9fe5c0f', progress: 'f04b0216', blocked: '6e1cb228', done: 'f27ade21' }
for (const pair of process.argv.slice(2)) {
  const [id, status] = pair.split('=')
  execFileSync(
    'gh',
    [
      'project',
      'item-edit',
      '--project-id',
      'PVT_kwDOBTuvM84Bte_U',
      '--id',
      id,
      '--field-id',
      'PVTSSF_lADOBTuvM84Bte_UzhroRF0',
      '--single-select-option-id',
      options[status],
    ],
    { env: { ...process.env, GH_ORG: 'twin-digital' }, stdio: 'ignore' },
  )
  console.log(`${id} ${status}`)
}
