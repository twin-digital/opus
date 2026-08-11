import { describe, it } from 'vitest'

// Implement-phase tests (Code wave), against the route test harness
// (test-support.ts) like limits.test.ts.
describe('/api/cooldowns (d-k3wq81vn, d-t6mhv3aq, r-t4jn8zvw)', () => {
  it.todo('GET lists the cooldowns with kind, interval_seconds, and created_at')
  it.todo('GET reports the kinds enabled notify operators currently name (kinds_in_use)')
  it.todo('POST creates a cooldown from {kind, interval_seconds}, trimming the kind, and returns its id')
  it.todo('POST refuses interval_seconds below 1 and non-integer intervals (d-t6mhv3aq)')
  it.todo('POST refuses an empty or multi-line kind with the structured invalid_kind_name refusal (d-u2rotm38)')
  it.todo('POST answers 409 cooldown_conflict for a kind that already has a setting')
  it.todo('PATCH changes the interval; DELETE removes the setting')
  it.todo('each accepted change appears in the change log with entity_type cooldown (d-w2fzk9bd)')
})
