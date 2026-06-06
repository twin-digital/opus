# Farwatch — Glossary

The canonical vocabulary for Farwatch: the one place a concept's name and meaning are fixed, so
every agent and human uses the same word for the same thing.

This document is a **north star**. It describes each concept as the finished design intends it, not
as the code happens to implement it at any moment. When a task says "implement an Adventure
system," this glossary is what that means.

Each entry is `**Term** — definition`. A term still settling on its name is marked **(working
name)**.

---

## Adventure

An adventure is how a covenant's striving becomes events. A party goes out to do a hard thing,
comes through a chain of trials, and what befalls them — who pressed on, what was won, what it cost
— is resolved and recorded here, to be read later as chronicle, questioned as testimony, or audited
in the log.

**Adventure** — One expedition's worth of events in the world: a connected region of the causal
graph, resolved as a graph of **trials**, answering "what happened." An adventure has an overall
**outcome** and may leave the covenant richer (a **prize**) or poorer (a loss). The adventure is
itself the outermost trial — the recursion below bottoms out at single **checks** and tops out at
the adventure as a whole.

**Trial** — The recursive unit of an adventure: a hard thing the party must come through. A trial
is _either_ a single **check**, _or_ a graph of smaller trials resolved together — so one word
covers "leap the lava stream" (a single check) and "cross the desert for ten days" (a graph of
trials rolled into one result). A composite trial can be left summarized ("they crossed, hungry and
two mounts the poorer") or zoomed into and resolved in full — the sandstorm, the dry well, the
mirage, each its own trial. A trial is built around an **obstacle** and the **courses of action**
for meeting it; its **outcome** decides whether the way onward opens or complicates, and it may
yield a **prize**.

**Check** — The atomic unit of resolution, and the floor of the recursion: a single gated test of a
skill against a difficulty, yielding an **outcome**. A check records its difficulty, its roll, and
the named modifiers applied — notably **edicts**, which enter as numeric biases — so the opt-in
**adventure log** is just a view of these records. "Gated" because a check sits behind a
**precondition** that decides whether it is attempted at all. The smallest trial is a single check.

**Obstacle** — The challenge a trial is built around: the in-world thing that must be overcome — the
lava stream, the sealed gate, the temptation of an unguarded hoard. (Even fortune is an obstacle
here: claiming the hoard means noticing it, reaching it, or resisting it.) An obstacle presents the
party with a set of **courses of action** and the **checks** they induce. It is authored through the
vocabulary **Overcome / Bypass / Modify / Disengage / Spend**, which enumerates those options; every
option reduces to the same three parts — a **precondition** that gates it, a **check** that resolves
it, and an **effect** it produces — not five separate mechanisms.

**Course of action (Option)** — One way the party can meet an obstacle: overcome it directly, bypass
it by another route, modify the situation first, disengage from the objective, or spend a stored
resource. A character chooses among the options _as they perceive them_ — perception filtered by
skill, magic, and state, so the choice may rest on a false reading of the situation — and that
choice induces a check.

**Approach** — The capability a party brings to bear on a trial's obstacle: combat, stealth,
deception, endurance, magic, and the like (a fixed pool). Where a **course of action** is the
_stance_ toward the obstacle (overcome it, bypass it, …), an approach is the _means_ — and the two
compose (overcome-by-combat, bypass-by-stealth). It is a mechanical skeleton with no narrative
texture of its own: it tells the chronicler _how_ the trial was met, and it carries a characteristic
**cost**.

**Outcome** — The resolved verdict of a check, and of the trial or adventure it rolls up into:
whether it succeeded or failed. The outcome is also the switch on the **consequence** edge — a
success opens the way onward (_therefore_), a failure complicates it (_but_).

**Consequence** — The edge between trials: how one trial's **outcome** leads to the next. The link
is causal — the next trial arises _because_ of how the last resolved (the same link the causal graph
stores as a _because_), read forward as what follows from it. Its grammar comes from the outcome:
_therefore_ on a success, _but_ on a failure — never "and then." An adventure is a chain of
_therefores_ and _buts_, which is what makes it a story rather than a list.

**Prize** _(also: find, boon)_ — What a trial yields on the reward side: treasure, a wonder, lore,
an ally, a place made safe. The unguarded gold is a prize, not a trial — the trial is reaching or
resisting it; the prize is what is carried home. A prize is recorded as an **effect** of the trial
that won it, distinct from the **outcome** (the verdict).

**Expedition** — A party dispatched from the covenant to pursue an aim in the world: who was sent,
where, and under what **dispatch** — including limits a seeker may keep or break ("to the cold
light, no farther"). An adventure is the resolved record of an expedition.

---

_Not in our vocabulary: **encounter** — its "scene around a challenge" sense is covered by **trial**,
its "meet a monster" sense by **obstacle**, and its combat connotation is one we avoid._

---

## Agents, resources, and goals

Beneath the adventure's events is a small economy: agents hold things, want changes to them, and act
to bring those changes about. Goals, stakes, and costs are all denominated in it.

**Agent** — Anyone or anything that holds **resources**, forms **bonds**, and pursues **goals**: an
individual seeker, a party, the covenant itself, a rival covenant, an outside person or faction.
Agents nest — a party is an agent made of agents — and a group's wants are not simply the sum of its
members'.

**Resource** — Anything an agent holds that can be gained, spent, lost, or transferred: material
(wealth, items), corporeal (life, health, vitality), social (fame, standing, followers, **bonds**),
mental (knowledge, skills), or volitional (morale, faith). Resources differ along the axes that
drive play — **fungible** (gold) vs **named** (a particular seeker or relic, where the drama lives);
**whose** they are; **persistent** (carried between adventures) vs **quest-scoped** (spent within
one). Every resource has a **subjective value**.

**Subjective value** — How much a particular agent values a particular resource. Worth is
agent-relative, so the same gold or the same life weighs differently on different people — which is
what makes a party non-monolithic, and what an **edict** must contend with when a seeker's own
valuation outweighs it.

**Goal** — A change in resources an agent wants: a direction, a magnitude, and whose resources move
("enrich ourselves" = +wealth, self; "break the rival's arsenal" = −items, other). Each agent holds
a **prioritized list of goals across time horizons** and acts to serve the highest it can reach — so
conduct is generated, not scripted — and the list **updates** as events land, raising new goals or
reordering old ones. Goals **chain** (instrumental → terminal: rescue → renown → the **charter**),
with the charter the apex every expedition serves beneath.

**Stakes** — The resources a **trial** puts at risk (lost on failure) or in reach (gained on
success). Distinct from a trial's **difficulty** (its odds): stakes are _how much it matters_,
difficulty _how likely it is_. A trial's **gravity** is its stakes weighted by **subjective value** —
a little fungible coin is trivial to lose, a named life grave, at the same odds.

**Cost** _(toll)_ — The resources an act spends or risks regardless of outcome. Each **approach**
carries a characteristic cost — `wealth` spends coin, `sacrifice` spends something precious, `combat`
risks health, `preparation` was paid before the trial. Cost is what the _method_ charges; stakes are
what the _obstacle_ threatens.

**Time · Progress · Viability** — Quest-scoped resources, spent within a single adventure rather than
carried out of it. **Time** is a depleting budget some approaches draw harder on; **progress** is
cumulative advance toward the goal (the deciding trial is progress crossing the line); **viability**
is whether the goal remains achievable at all — foreclosed if the captive dies or the relic is
destroyed, however much progress was made.

---

## Bonds

_Working — under active design. Captured so the vocabulary is shared while it settles; expect this
section to move._

Bonds are the relational resources: held not by an agent but **between** two, as directed edges in a
web.

**Bond** — A directed, typed tie from one **agent** to another — or, reflexively, to itself — with a
strength gained and lost like any **resource**, but relational: A's bond to B is its own edge,
asymmetric to B's bond to A. A bond carries a **kind** (below). When a bond crosses a threshold it
does not fire a hardcoded event; it **raises a goal in the affected agent**, who then acts on it. The
king executes a disobedient seeker not by rule but because the disobedience dropped his standing,
raising his goal to restore it by just punishment — the axe is his _action toward his goal_. So
consequences stay agent-mediated and traceable, and a bond reaches across resource domains (a social
tie ending a corporeal life) through the goals it provokes.

**Bond kinds** —

- **Honor** — regard, duty, and standing, across any endpoints: self→self is self-respect, you→liege
  is fealty, liege→you is the regard that keeps you alive, mortal→patron is faith. One kind spanning
  the respect/duty/loyalty cluster. _(Open: honor may be two quantities — **esteem** (do I regard
  you) vs **obligation** (am I bound to you) — which can diverge, as in the knight sworn to a king he
  despises. Held as one for now.)_
- **Love** — affection and attachment (the cast's ties).
- **Fear** — dread of another (what `intimidation` trades in).

**Reflexive bond** — A bond whose endpoints are the same agent (self→self): self-respect, conscience.
It updates from the agent's own deeds rather than another's regard, but otherwise behaves like any
bond — including raising a self-directed goal when it bottoms out (despair, recklessness, a walk into
the deep).

---

_Referenced above, with sections of their own to come: Resolver · Adventure log · Edict · Dispatch ·
Seeker · Covenant · Charter · Causal graph · Chronicle._
