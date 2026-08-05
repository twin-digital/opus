import { describe, it } from 'vitest'

// The reconcile's orchestration lands in the Code wave; the difference it computes is already
// covered by plan.test.ts. These are the checks that need the executor, driven through a fake
// compose runner rather than a daemon.
describe('the reconcile', () => {
  // d-3ya31m19 — five steps, in order
  it.todo('discovers, reads the server, compares, applies, and brings the change live in that order')

  // d-1u13wl57 — discovery runs at the head of every reconcile
  it.todo('re-runs discovery on every reconcile, so a raised version reaches the next deploy')

  // d-q8ikxtdk — each reconcile reads live server state
  it.todo('reads the pool and activation lists off the container rather than a record of them')

  // d-n0dz38ky — a pool directory is replaced, not merged into
  it.todo("removes a pack's pool directory before copying into it")

  // d-0qo3xvev — one at a time, and changes during one coalesce
  it.todo('runs one reconcile at a time and coalesces the changes that arrive during one')

  // d-n81zkitr — a reconcile that throws changes nothing and is retried on the next save
  it.todo('reports a reconcile that threw and leaves the server untouched')
})
