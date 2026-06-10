/**
 * Poll-loop surface (pipeline-runtime.md "Process model → Poll loop"). The
 * daemon constructs the scheduler here with the production {@link
 * ProviderFactory}, `start()`s it after the execution loop, and `stop()`s it in
 * the shutdown sequence. Tests drive `pollDueAccounts`/`pollAccount` directly.
 *
 * The poll loop only *enqueues* Triages; the execution loop discovers their
 * `pending` runs on its own ticks — no explicit hand-off (see
 * `execution/index.ts`).
 */

export { type PollCycleSummary, type PollableAccount, pollAccount } from './poll-cycle.js'

export { type ProviderFactory, productionProviderFactory } from './provider-factory.js'

export { type LiveProviderFactoryDeps, createLiveProviderFactory } from './live-provider-factory.js'

export { type PollScheduler, type PollSchedulerDeps, createPollScheduler } from './poll-scheduler.js'
