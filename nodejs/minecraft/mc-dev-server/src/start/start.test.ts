import { describe, it } from 'vitest'

// The start sequence lands in the Code wave, driven through a fake compose runner. The rungs it
// walks are already covered by ladder.test.ts.
describe('start', () => {
  // r-8et233c9 — one command from a clean checkout to a running, watched server
  it.todo('builds, brings the server up, deploys the current build, and begins watching')

  // d-5e00ndwi — build activity and server output share one stream
  it.todo('interleaves build, deploy and server lines on the one tagged stream')

  // d-vrq7lc2o — a build that fails does not stop the start
  it.todo('deploys a pack whose build failed as a stub and reports the failure')

  // d-n81zkitr — a run hosts what was asked for or it does not start
  it.todo('fails before bringing anything up when a selected pack is invalid')

  // d-duvygv2f — the first deploy of a fresh world pays a restart
  it.todo('restarts once against a fresh volume and reports it as part of starting')

  // d-e956frnx — the harness does not accept the EULA on the author\'s behalf
  it.todo('fails and links the EULA when neither the flag nor the config accepts it')

  // d-wgzr4lvx — one attached run per workspace
  it.todo('refuses to attach when another harness is already attached, naming it')

  // d-62bpn2h2 — signals detach and leave the server running
  it.todo('detaches on SIGINT, SIGTERM and SIGHUP, exiting 0 with the server still up')

  // d-owprl7uy — the destructive rung is never taken without an answer
  it.todo('bails out rather than regenerating a world where nothing can be asked')

  // r-whacwz1b, r-kfu7pcms, r-cekp2mcb — a live daemon, a real world, a connected client
  it.todo('[manual-check] runs the whole loop against a remote daemon with a client connected')
})
