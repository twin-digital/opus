// Roster slot-assignment logic lives in the compute package (the rollout needs it too);
// re-exported here so web callers and tests keep their import path.
export { buildRoster } from '@twin-digital/football-compute'
export type { ByeCollision, RosterPlayer, RosterSlot, RosterSummary } from '@twin-digital/football-compute'
