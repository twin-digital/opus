# Farwatch — Adventure Simulation (WIP)

_Working design doc, running ahead of the code, captured as we settle it one piece at a time. This
is the **mechanical** model of an adventure — how trials resolve, and the resource economy of goals,
costs, and stakes. Its companion [`social-simulation.md`](social-simulation.md) holds the
resource/bond theory; the [glossary](glossary.md) holds the terse definitions. Expect it to move._

The adventure structure itself (adventure → chain of **trials** → **checks**, each met with an
**approach**) is defined in the glossary; this doc adds the **resource economy** layered onto it.

---

## Resources in play

A resource is a **kind** plus an **amount**, but the amount's shape depends on fungibility:

- **Fungible** kinds carry a **tier** — `minor / moderate / major / extreme` (ordinal 1–4
  internally, always surfaced as the word). There are **no units**: never "3 wealth," always "a
  _major_ haul of coin."
- **Non-fungible** kinds have **no tier** — they're a _specific named instance_, had or not (a
  particular relic, a particular secret).

So a resource delta is one of two shapes: `{ kind, tier }` (fungible) or `{ kind, ref }`
(non-fungible — a named one-off).

**Starter kinds** (small on purpose — lean vocabulary):

- _Fungible:_ `wealth` · `supplies` · `vigor` · `renown` · `lore`
- _Non-fungible:_ `item` (a particular treasure/artifact) · `secret` (a particular thing known)

`lore` (general knowledge) vs `secret` (knowing one specific thing), and `wealth` (fungible coin) vs
`item` (the specific macguffin), are the fungible/non-fungible pairs.

## Goals

An adventure has:

- **one primary goal** — the reward the party set out to win;
- **0–n optional goals** — known but secondary;
- **0–n unknown goals** — discovered along the way, occasionally worth more than the primary.

A **goal's reward is a resource delta** (a fungible tier, or a non-fungible `item`/`secret`). The
reward kind quietly sets the quest's flavor — `wealth` → a treasure-hunt, `secret` → an
investigation, `item` → a recovery. The covenant gains the reward only if the adventure succeeds.

How they're generated:

- **Known goals (primary + optional) are pre-generated** — the authored frame the party went out for.
- **Unknown goals are trial-spawned** — a trial's outcome can mint a new goal as an _effect_, so the
  discovery has a **cause** ("they found the bell _because_ they pressed into the deep") rather than
  appearing by luck. The roll uses the same seeded RNG, so a seed still yields a fixed adventure.
- The primary carries a hidden **viability** flag — it may not actually be there / exist; a trial
  reveals it.

_Deferred:_ **destructive** goals (reduce a _rival's_ resources) need a second agent, so they wait
for the agent work. For now a goal is a gain for the covenant.

## Costs (upfront)

A **cost** is a price paid **up front to attempt a trial, win or lose**. It is **optional and rare** —
most trials have no upfront cost (it costs nothing to _start_ a fight). Where present, it is
approach-linked:

- `wealth` → lays down coin
- `sacrifice` → gives up something precious
- shameful methods (cowardice, atrocity) → spend `renown`

Two boundaries we've drawn:

- **Outcome-driven tolls are not upfront cost.** The vigor a fight costs you _afterward_ is a result
  of how the trial went — that belongs to **stakes**, not cost.
- **We don't model spend-to-gain rationality** (how much `wealth` one would risk to gain `wealth`).
  That calculus is below our resolution.

## Stakes and prizes

A trial's outcome moves resources in both directions:

- **Stakes** — the downside, **lost on failure** (a `moderate` loss of `vigor` after a fight gone
  badly, `supplies` scattered, `renown` spent on a rout). For now, stakes are paid **only on
  failure** — and only _some_ failed trials carry a permanent-resource stake (weighted in at
  generation). Most failures instead spend a **quest-scoped** resource (see below).
- **Prize** _(positive stakes / boon)_ — the upside, **gained on success**. This is the glossary's
  **Prize** in resource form, and it is how an _orthogonal_ trial pays out: a side-encounter the
  party wins grants a boon to the ledger, independent of the primary goal. (The primary goal's reward
  is essentially the prize of the climactic trial; incidental prizes are the smaller boons along the
  way.)

So: **fail → lose the stakes; succeed → gain the prize.** Both are resource deltas; a trial may have
either, both, or neither.

### Resolution gradients (placeholder)

Outcomes are **binary** today (success / failure), which is why stakes attach cleanly to failure and
prizes to success. A richer resolution mechanic — to express **success with a cost** and **failure
with a gain** (mixed/partial outcomes, in the spirit of PbtA's 7–9 or Blades' consequences) — is
wanted but deferred. When it lands, stakes and prizes stop being failure-only / success-only and
become outcome-_graded_.

## Quest-scoped resources & overall outcome (placeholder)

_Deferred, but sketched because it reshapes how an adventure resolves._

Most failures don't cost a **permanent** resource — they cost a **quest-scoped** one, spent within
the adventure and never entering the ledger:

- **Time** — a budget for the expedition; failures and slow approaches spend it. Run out → forced
  retreat.
- **Viability** — whether the goal is still reachable; some failures erode it, and a foreclosing
  event (the captive dies, the relic is taken) zeroes it.
- **Progress** — advance toward the goal; successes add, some failures stall or reverse it.

Tracking these points past the current **"the final trial decides"** rule toward a **graded overall
outcome**: the adventure succeeds if progress reaches the goal while viability holds and time
remains, and _how_ it fails — abandoned, too late, foreclosed — falls out of which quest-scoped
resource gave way. That richer resolution and the resolution-gradients above are the **same future
step**: the overall outcome stops being one binary and starts emerging from the quest-scoped economy.

## The ledger

The ledger is the **itemized list of resource movements** an adventure produced — one line per
movement, each tagged with its source: a trial's upfront cost, a failed trial's stake, a won trial's
prize, and the goal reward on overall success. It is **not** a summed net per kind — tiers stay
discrete, and the list reads straight to the chronicler ("they spent…, lost…, came home with…").
Aggregating into a net delta per kind waits for a persistent covenant pool to apply it against
(deferred).

## Generation rules

Weighted random picks come from small, **editable weight tables** (data, not hardcoded branches), so
tuning the feel is a config edit rather than a code change.

**Primary goal.** The reward **kind** is drawn from a weight table skewed toward the quest-worthy
kinds (`item`, `secret`, `wealth`) over the mundane (`supplies`, `vigor`, `renown`, `lore`). A
fungible kind then rolls a reward **tier** from a tier-weight table; a non-fungible kind is simply "a
specific one," named by the chronicler. The primary carries a small chance (~15%) of being
**inviable** — not actually there — revealed by a trial.

**Stakes.** Only _some_ failed trials carry a permanent stake (weighted in at generation). Its
**kind** comes from a **per-approach weighted table** — each approach lists the full set of stakes
that could plausibly follow it, weighted by likelihood: a failed `combat` is almost always `vigor`
(wounds), but rarely `wealth` (treasure dropped in flight) or `renown` (cowardice, begging). Its
**tier** is a weight table, for now.

**Prizes.** Only _some_ won trials yield a prize (weighted in). Its **kind** comes from a **general
weighted table** (skewed to `wealth` / `item` / `lore` / `secret`), independent of approach; its
**tier** from a weight table.

**Upfront cost.** Only the few approaches that genuinely pre-pay carry one (`wealth` lays down coin,
`sacrifice` gives something up); its kind is that approach's, its tier fixed-per-approach for now.

**Unknown-goal spawns.** A trial mints an unknown goal only on a **success**, at a low per-trial
chance; its reward is drawn from the goal table, so it is occasionally a large `item`/`secret` worth
more than the primary.

**Optional goals.** A count from a weighted table (percentile → 0 / 1 / 2…, skewed to none-or-one).
Each optional goal is **bound to a specific trial**: winning that trial earns it, and its reward
becomes that trial's **prize** (superseding the random prize roll there). So optionals are _known_
prizes on _known_ trials, sprinkled through the chain rather than granted for the overall win.
Rewards are drawn from the goal table, skewed smaller than the primary. For now the bound trial is
always attempted.

## Parked / open

- **Pre-genned unknowns informing trials** — the inversion of trial-spawned unknowns; could let the
  hidden unknowns shape the trials that reveal them. Simpler trial-spawn route chosen for now.
- **Spend-to-gain rationality** — not modeled (above).
- **Fixed vs rolled cost tier** — for the rare upfront costs, undecided; likely fixed-per-approach to
  start.
- **Enforce vs compute** — first cut computes the ledger; depleting a persistent covenant pool (and
  failing on exhaustion) waits for persistence.
- **Risk known upfront / agent-chosen approaches** — today the approach is rolled at random and its
  stake tier rolled blind. Later, when agents _choose_ the approach, the risk/tier is known up front
  and shaped by the trial's nature: nobody picks `combat` against the take-no-prisoners torture-clan.
  The random roll is a placeholder for that choice.
- **Decision points** — let the party (an agent) choose whether to attempt or skip the trial that
  gates an optional objective, weighing its cost/risk against the reward. Needs agent decisions;
  today the bound trial is always attempted.
