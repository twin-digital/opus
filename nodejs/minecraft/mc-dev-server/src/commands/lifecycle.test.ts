import { describe, it } from 'vitest'

// stop and destroy land in the Code wave; the compose calls they make are covered by
// docker/compose.test.ts.
describe('stop', () => {
  // d-7ayy4btp — the world is written before the process goes down
  it.todo('takes the server down through the console stop, waited for, never a kill')

  // d-zo2yl18y — the volume outlives a stop
  it.todo('leaves the volume standing, so every world survives to the next start')

  // d-62bpn2h2 — stop exits 0 on success
  it.todo('exits 0 when the server was running and when it was not')
})

describe('destroy', () => {
  // d-0yrfifhi — it names what it is about to remove and asks
  it.todo('names the worlds it is about to remove and asks before removing them')

  // d-0yrfifhi — where nothing can be asked it does nothing
  it.todo('does nothing where nothing can be asked')

  // d-zo2yl18y — only destroy removes the volume
  it.todo('removes the volume and every world on it once the author agrees')
})

describe('watching built output', () => {
  // d-j3ayhwv1 — the harness watches only the built output directories
  it.todo("deploys on a debounced change to a selected pack's built output")

  // d-n81zkitr — a watch process that exits is reported and not restarted
  it.todo('reports a watch process that exited and does not restart it')
})
