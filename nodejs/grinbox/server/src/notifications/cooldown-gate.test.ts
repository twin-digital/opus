import { describe, it } from 'vitest'

// Implement-phase tests (Code wave), against the in-memory test DB. The gate
// is the seam Notify consults before its push reaches any Resource
// (d-5amonj40, d-6ptxams7).
describe('createNotificationGate', () => {
  it.todo('a kind with no cooldown setting is never suppressed (d-t6mhv3aq)')
  it.todo(
    'a push inside the interval suppresses: verdict carries the kind and the run whose push it deferred to (d-e9jslw4x)',
  )
  it.todo(
    'suppression emits a push_suppressed event through the run event channel, with kind and deferred-to run identifiers',
  )
  it.todo('a push outside the interval is not suppressed; the newest delivered push is the one deferred to')
  it.todo('recordPush records the delivered push per user and kind for later runs to defer to')
  it.todo('operators naming one kind share one cooldown across pipelines (d-k3wq81vn)')
})

describe('notify with a kind (d-vn2jdxbs, d-5amonj40, d-6ptxams7)', () => {
  it.todo('a suppressed push reaches no resource: send_notification is never invoked and no limit counter moves')
  it.todo('a suppressed run completes (not failed); the triage settles as it would have')
  it.todo('a notify naming no kind has no cooldown and sends exactly as before (r-5ezt7j0v)')
  it.todo('a successful kind-named push is recorded so a burst of related mail costs one push (r-lph86tsg)')
  it.todo('seeded limits still bind under the cooldown: a push the cooldown passes can still be skipped_by_limit')
})
