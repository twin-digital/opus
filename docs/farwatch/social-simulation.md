# Farwatch — Social Simulation (WIP)

_Working design doc, running ahead of the code. It develops the model beneath goals, stakes, and
motivation: a small economy of **resources** and **bonds** that **agents** act on. The
[glossary](glossary.md) holds the terse canonical definitions; this doc holds the reasoning, the
worked examples, and the social-science lineage the model draws on. Expect it to move._

It expands the social side of the design's "tag genome," "web of influence," and "emergent
character" pillars (see `design-deep.md` §4–6) into something concrete enough to build toward.

---

## 1. The core loop

Everything here is one closed cycle:

> **resources & bonds → goals → actions → resources & bonds**

An **agent** holds resources (including bonds), which give rise to **goals** (wanted changes to
those resources), which it acts on, and those actions change resources and bonds — for itself and
others — which raise new goals. The simulation is this loop turning across many agents at once.

Two properties make it generative rather than scripted:

- **Subjective value.** A resource's worth is agent-relative, so the same gold or the same life
  weighs differently on different people. This is the design's _affinity_ axis, and it is what makes
  a party not one mind but several.
- **Agent-mediated consequence.** Nothing fires by hardcoded rule. When a bond or resource crosses a
  threshold it **raises a goal in the affected agent**, who then acts. The king does not execute a
  disobedient seeker because a rule says so — the disobedience dropped his standing, which raised his
  goal to restore it by just punishment, and the axe is his _action toward that goal_. Consequences
  stay traceable to a why-chain, which is what the comprehension layer reads.

## 2. Agents

An **agent** is anything that holds resources, forms bonds, and pursues goals: an individual seeker,
a party, the compact itself, a rival compact, an outside person or faction. Agents **nest** — a
party is an agent made of agents — and a group's wants are not the sum of its members'. Where a
group acts as one (the party crossing a ford) it is a single agent; where its members diverge (one
seeker breaks ranks) the members are the agents. Resolving that — when the party is one will and when
it is many — is an open modelling question.

## 3. Resources

A **resource** is anything an agent can gain, spend, lose, or transfer. The single type spans the
whole list once sorted by the axes that change how it behaves:

- **Domain** — material (wealth, items), corporeal (life, health, vitality), social (fame, standing,
  followers, **bonds**), mental (knowledge, skills), volitional (morale, faith).
- **Fungible vs named** — gold is interchangeable; _Gerald_ and _the cartographer's bones_ are not.
  The drama lives entirely in the named/non-fungible; fungible resources are the economy's lubricant.
  (This is why permanent death is the heart of the design: a seeker is the least-fungible resource
  there is.)
- **Whose** — every resource belongs to an agent. A goal or stake always names _whose_ resources move.
- **Persistent vs quest-scoped** — wealth, seekers, fame carry between adventures; **time**,
  **progress**, and **viability** exist only within one (below).
- **Subjective value** — the worth axis, agent-relative (§1).

### Quest-scoped resources

An adventure spends ephemeral resources to buy a persistent one (the goal). Three matter:

- **Time** — a depleting budget; some approaches draw harder on it (the long way around). Exhausting
  it forces retreat.
- **Progress** — cumulative advance toward the goal; the deciding trial is progress crossing the line.
- **Viability** — whether the goal remains _achievable at all_. Distinct from progress: if the
  captive dies or the relic is destroyed mid-quest, the goal is foreclosed however much progress was
  made.

## 4. Goals

A **goal** is a wanted change in resources: a direction, a magnitude, and whose resources move
(`+wealth, self`; `−items, rival`; `restore a named person, to their kin`). Goals are acquisitive
_or destructive_, aimed at self, group, or other.

- **A prioritized list across time horizons.** Each agent holds many goals (immediate, near, long)
  and acts to serve the highest it can reach — so conduct is generated. The list **updates** as
  events land, raising new goals or reordering old ones (a fresh insult, injury, or opening).
- **Chains.** Instrumental goals serve terminal ones: _rescue the captives → win the village's
  renown → feed the charter._ The chain is itself a why-graph the comprehension layer can surface.
- **The charter is the apex.** Every expedition is an instrumental sub-goal beneath the compact's
  founding purpose.
- **Pull = subjective value.** How hard an agent strives for a goal is how much it values the target
  delta — which is why a party with shared orders still acts many ways.

## 5. Stakes, gravity, and cost

Three things that get conflated, kept separate:

- **Difficulty** — the _odds_ a trial's approach succeeds.
- **Stakes** — the resources a trial puts at risk (lost on failure) or in reach (gained on success).
- **Gravity** — stakes weighted by **subjective value**. A little fungible coin is trivial to lose;
  a named life is grave, at the same odds.

They are orthogonal: a trial can be **easy-but-deadly** (one slip on the ledge ends you) or
**hard-but-cheap** (a fiendish puzzle whose failure only costs time). This is the Blades-in-the-Dark
_position_ (consequence severity) vs _effect_ (progress) split, foreshadowed by the
`resolution-mechanics.md` `position / downside-cap / toll-profile`.

**Cost** is separate again: the resources an _act_ spends regardless of outcome. Each **approach**
carries a characteristic cost — `wealth` spends coin, `sacrifice` spends something precious, `combat`
risks health, `preparation` was paid before the trial. Cost is what the _method_ charges; stakes are
what the _obstacle_ threatens.

## 6. Bonds

Bonds are the **relational resources** — held not _by_ an agent but _between_ two, as directed edges
in a web.

- **Directed and asymmetric.** A's bond to B is its own edge; my regard for you need not match yours
  for me. Oathbreaking hits two edges at once, in opposite directions: you sever your _fealty_ (you →
  king) and the king loses _trust_ (king → you).
- **Gained and lost like any resource**, but updated through interaction (§7, Collins).
- **Thresholds raise goals**, not hardcoded events (§1). A bond reaches across resource domains — a
  social tie ending a corporeal life — _through the goals it provokes_ in the affected agent.

### The reflexive bond is `self → internalized-other`

Self-respect / conscience looks like a `self → self` loop, but it is cleaner read as the agent
bonded to an **internalized other** — Mead's _generalized other_, Cooley's _looking-glass self_,
Freud's _superego/ego-ideal_. This dissolves the only reflexive special case (it is a normal directed
bond whose target is internal) and explains two things:

- **Trait-dependence.** "Some people don't lose self-respect acting dishonorably" = _whose_ standards
  they have internalized, and how heavily. The remorseless raider never internalized a bond to
  outsiders, so betraying them costs his self-bond nothing.
- **Guilt vs shame.** Violating an internalized _standard/authority_ (AR-flavored) is **guilt** ("I
  did a bad thing"); falling short before an internalized _communal audience_ (CS-flavored) is
  **shame** ("I am bad"). Self-punishment (a seeker's walk into the deep) is the internalized
  standard's violation-script firing inward — the same mechanic as the king's axe, judge and judged
  in one person.

### Defiance is which bond wins

A broken edict is never random: it is a seeker choosing which bond to honour when two conflict.
Gerald past the cold light — his bond _to the deep_ (affinity) outweighed his _fealty to the
dispatch_. He spent the fealty to keep the deep-bond. The "legible cause" the design promises is
_which bond won, and why it was heavier for him_.

## 7. Theoretical lineage

Four social-science frameworks fill gaps a flat "kinds of bond" list leaves. They are **orthogonal
layers, not competitors** — each consumes the one above it:

| Layer          | Framework                                | Answers                                    |
| -------------- | ---------------------------------------- | ------------------------------------------ |
| **Structure**  | Fiske, Relational Models Theory          | _what kind_ of bond                        |
| **Status**     | Henrich & Gil-White, Dominance/Prestige  | _what powers_ a hierarchy                  |
| **Dynamics**   | Collins, Interaction Ritual Chains       | _how_ bonds & energy flow over time        |
| **Evaluation** | Kelley & Thibaut, Interdependence Theory | _how an agent judges outcomes; stay/leave_ |
| **Actuation**  | goal-stacks (§4) + attachment traits     | _how an agent acts_ on the above           |

### Structure — Fiske's four relational models

Nearly all relationships run on four "grammars," and they classify our cases:

- **Communal Sharing** — "we are one"; kinship, needs-based, the compact-as-family. → _familial
  obligation, love._
- **Authority Ranking** — linear hierarchy; superiors lead/protect, subordinates defer/obey. →
  _fealty, the oath to a king, the patron._
- **Equality Matching** — balanced reciprocity among peers; tit-for-tat, favours owed, an eye for an
  eye. → _honour-debts, vengeance._
- **Market Pricing** — proportion and price; value-for-value. → _wages, the mercenary, bought passage
  (the `wealth` approach)._

Two payoffs:

1. **It resolves the esteem/obligation split.** A bond = a **relational model** (the obligation-logic
   — what's owed and why) × an **affective valence** (esteem — cherished or despised). The
   sworn-but-resentful knight = _Authority Ranking model + negative valence_ — which one scalar can't
   hold, but `model × valence` can.
2. **The model dictates the violation-script** — i.e. the goal a breach raises (§1): CS betrayed →
   exile/grief; AR defied → reassert rank (_punish_ — the king); EM unbalanced → restore balance
   (vengeance); MP cheated → recoup/sever. So consequences are generative, not a lookup table.

### Status — Dominance vs Prestige

This refines _one Fiske cell_ (Authority Ranking): rank is held two ways, and it is the honour/fear
split applied to status.

- **Dominance** — rank via force/fear; rests on **fear** bonds, signalled by avoidance, needs
  constant enforcement, breeds resentment.
- **Prestige** — rank via freely-conferred deference; rests on **esteem/honour** bonds, signalled by
  approach (others seek and copy you), stable but must be continually re-earned.

It maps to approaches (`intimidation` → dominance; competence + `charm`/`performance` → prestige) and
gives factions distinct **vulnerabilities** — a dominant warlord falls when shown not fearsome or
when enforcement lapses; a prestigious sage falls when exposed as a fraud. The patron is
**prestige**, not dominance: _summoned_, not seized.

### Dynamics — Collins's Interaction Ritual Chains

The time-axis Fiske lacks. Relationships are produced and recharged by rituals (co-presence + shared
focus + shared mood → solidarity + **emotional energy** + charged symbols). What it buys:

- **A trial is an interaction ritual.** Beyond its task result, every trial emits a _social_ result —
  party solidarity and each seeker's energy, up or down. The 3 + 1 climax is the peak ritual; bonds
  are forged and broken here.
- **Bonds are decaying residue** that fade without re-investment, so relationships need _tending_ —
  and the patron-bond drains in your **absence** because no rituals recharge it. That is the
  presence/absence → devotion → ending pillar, mechanized.
- **Charged symbols** explain how a thing _becomes_ worth defending (the bell, the founder's bones).

_Caution:_ Collins is imperialistic — he wants emotional energy to explain everything. We keep it as
**one resource** (morale/élan) and use the ritual chain as the _update process_, not the master
variable.

### Evaluation — Interdependence Theory

The cold comparator Collins's affect feeds into. An agent judges a relationship's outcomes against
two reference points, and the comparison — not the raw outcome — drives the decision:

- **Comparison Level (CL)** — what the agent _expects or feels it deserves_. Outcomes above CL →
  satisfaction; below → resentment. The "content or aggrieved" dial.
- **Comparison Level for alternatives (CLalt)** — the best option elsewhere. Outcomes above CLalt →
  stay; below → leave. This is what makes a seeker endure a hard compact (no alternative) or defect
  to a better one — **the seeker-retention, defection, and migration engine** the multi-compact
  world needs. Rusbult's investment model operationalizes it (_commitment = satisfaction + investment
  − alternatives_), where investment is sunk resources/bonds/years — tying back to Collins (rituals
  _are_ investments) and the resource ledger.

It also renames rather than duplicates a piece we already had: the _transformation of motivation_
(raw self-interest reshaped by values into the outcomes actually acted on) is a named engine for our
**subjective value**. Critically, this layer does not overlap Collins — **Collins produces the felt
outcomes; Interdependence evaluates them** against CL/CLalt. Stack them; never run both as
independent "drift toward good relationships" rules.

### Actuation — attachment & the self

Agents differ in _how_ they form, weight, and revise bonds — roughly the secure / anxious / avoidant
pattern of attachment theory. This is the trait layer that makes two seekers in one situation defy or
comply differently, and it is where the self-bond's internalized standards (§6) live.

## 8. Where the leanness actually belongs

"Lean genome / shallow systems, deep history" is easy to misread as "keep the engine thin." It does
not mean that. **Depth belongs in the verbs; leanness belongs in the nouns and the dials.** A deep
engine — resources → goals → bonds, charged by rituals, judged against CL/CLalt — over a _small_
vocabulary and a _small_ exposed/tunable surface is exactly what the design asks for. (The design
even calls the genome "**dense** and never exposed" — the leanness was always about the surface, not
the model.)

"Lean" is really four separate constraints, and each binds a _different_ thing — none of them the
engine's structural depth:

- **Comprehension** → the vocabulary that surfaces in why-chains must be small and **nameable**
  ("because he loved the deep," not "temperament dim-7 = 0.31").
- **Resonance liveness** → few _tags_ in the resonance axes, so tag-profiles collide often enough to
  stay alive (what the LLM janitor maintains).
- **Anti-optimization** → few _player-facing_ stats and dials, so grief never becomes a min-max build.
- **Tuning tractability** → few _free parameters_, since the hard 20% is tuning by taste.

So keep depth, but pass it through two gates:

1. **The comprehension gate** — every mechanically-significant driver must be expressible as a
   plain-language cause. If a factor can't become a sentence in a why-chain, it may not drive an
   outcome. (A filter on _what_ depth is allowed, not a cap on _how much_.)
2. **The surface budget** — keep the vocabulary, the player-facing stats, and the free knobs small
   however deep the hidden engine grows.

And calibrate the depth empirically, not on principle. `target-saga.md` is the oracle: its
**minimum-substrate** reading ("~2 salient traits, 1 bond, 1 edict, 1 causal chain, 1 death") is this
very question answered by example. The method:

- design the _conceptual model_ here as richly and coherently as the social dynamics demand (a whole
  reads better designed top-down than accreted);
- build the _substrate_ outside-in — add a piece only when a generated chronicle visibly lacks it;
- hold the _exposed surface_ small no matter how deep the engine gets.

The asymmetry that settles "too thin vs bloat": a too-thin engine **fails to generate the saga** (the
product doesn't exist — a hard failure), while a too-rich one **costs tuning time and risks illegible
causes** (soft, fixable). Under-building the engine is the worse error; over-exposing surface is the
cheaper one to avoid. So: **rich design model, lean built surface, depth set by the target reading —
never minimized for its own sake.**

## 9. Open questions

- **Bonds: `model × valence` substrate, or flat kinds?** Adopt Fiske's models × valence as the real
  substrate (principled, resolves esteem/obligation, gives violation-scripts free) — or keep flat
  `honour / love / fear` kinds for now and treat RMT as the foundation we head toward? Leaning toward
  writing RMT in as the destination even while early code stays flat.
- **Reputation: aggregate or scalar?** Is fame an emergent sum of individual trust-bonds (free
  consistency, costlier) or its own non-relational scalar (cheaper)? Same fork as world-persistence,
  one level down.
- **Esteem vs obligation** — hold honour as one quantity until the resentful-loyal knight forces the
  split (= model vs valence).
- **Love, decomposed?** Sternberg's intimacy + passion + commitment, the way honour decomposed — if
  and when love needs cracking open.
- **Party as one agent or many** (§2) — when shared will, when divergent.
- **Emotional energy** — confirm it stays one resource among many, not the master variable.
- **CL / CLalt as thin reference values** — carry them as a couple of per-relationship numbers with a
  "stay if outcome > CLalt" rule, not the full outcome-matrix / game-theory apparatus.
