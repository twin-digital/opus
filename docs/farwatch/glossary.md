# Farwatch — Glossary

The canonical vocabulary for Farwatch: the one place a concept's name and meaning are fixed,[^retired] so
every agent and human uses the same word for the same thing.

This document is a **north star**. It describes each concept as the finished design intends it, not
as the code happens to implement it at any moment. When a task says "implement an Adventure
system," this glossary is what that means.

Each entry is `**Term** — definition`. A term still settling on its name is marked **(working
name)**.

---

## Adventure

An adventure is how a compact's striving becomes events. A party goes out to do a hard thing,
comes through a chain of trials, and what befalls them — who pressed on, what was won, what it cost
— is resolved and recorded here, to be read later as chronicle, questioned as testimony, or audited
in the log.

**Adventure** — One expedition's worth of events in the world: a connected region of the causal
graph, resolved as a graph of **trials**, answering "what happened." An adventure has an overall
**outcome** and may leave the compact richer (a **prize**) or poorer (a loss). The adventure is
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

**Expedition** — A party dispatched from the compact to pursue an aim in the world: who was sent,
where, and under what **dispatch** — including limits a seeker may keep or break ("to the cold
light, no farther"). An adventure is the resolved record of an expedition.

**Dispatch-limit** — A **per-trip** instruction set when an expedition is dispatched ("to the cold light,
no farther"): scoped to that one expedition and gone with it, and — like any order given to autonomous
people — one a seeker may **keep or break**. It is *not* an **edict**: an edict is a *standing* posture
that persists across every dispatch until changed, whereas a dispatch-limit binds a single trip. Same
conceit, different scope — _this trip_ vs. _always_.

---

_Not in our vocabulary: **encounter** — its "scene around a challenge" sense is covered by **trial**,
its "meet a monster" sense by **obstacle**, and its combat connotation is one we avoid._

---

## Agents, resources, and goals

Beneath the adventure's events is a small economy: agents hold things, want changes to them, and act
to bring those changes about. Goals, stakes, and costs are all denominated in it.

**Agent** — Anyone or anything that holds **resources**, forms **bonds**, and pursues **goals**: an
individual seeker, a party, the compact itself, a rival compact, an outside person or faction.
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

## Chronicler implementation

The chronicler turns a resolved **adventure** into prose. Where the rest of this glossary fixes
design intent, this section names the concrete machinery we build the chronicler _with_ —
implementation vocabulary, kept here so prompt and pipeline work shares one set of words. It is
distinct from **Chronicle** (the reading itself, a section still to come): this is how the reading
gets made.

### What may be said, and in what voice

**Chronicle view** _(also: chronicle-legal view)_ — The dice-free projection of an **adventure**
handed to the model: the narratively meaningful facts of what happened, with the resolver's
mechanics (rolls, difficulties, the numbers behind a verdict) stripped out. It is the _fact_ side of
the fact-vs-invention line — everything the chronicler may state as true, and nothing it must not
see. What it carries grows with the design; today that includes the trials in order with their
**approach** and **outcome**, the resource movements they realized, and the **goal** they served —
but the line that defines the view is _outcomes and stakes, not the dice_, not any fixed list.

**Few-shot example** — Exemplar narrations shown to the model to anchor it, bound to the chosen voice
(the **register** / **writing style** / **invention** selection) so the examples match what is being
asked rather than pulling the model toward a single prototype. Generated ahead of time, one set per
voice combination.

**Invention** — How far the chronicler fleshes out _beyond_ the **chronicle view** — the dial on the
fact-vs-invention line, from tight (state only what the record holds) to free (name people and
places, supply texture the record omits). What it may never do is contradict the view.

**Register** — The narrator's _stance_: the fixed point of view and diction the whole chronicle is
spoken from — a legend's exalted remove, a folktale's plainspoken warmth, a dry annalist keeping the
record. One of the **axes** the prose composes from, orthogonal to **writing style**, so the same
register can be rendered ornate or spare.

**Writing style** — How ornate the prose is: the ornament dial, register-neutral, running from mythic
and figured to plain and unadorned. It composes with **register** (which voice) as an independent
**axis** (how ornate that voice sounds).

### How a coherent telling gets built

**Cast** — The named, motivated figures a **treatment** fixes (roles and wants, not just names), so
the same people read consistently across a telling. Collected across the trials into a persistable
list — a seed for **world-state** that outlasts the run, so a place or person met once can be reused
rather than re-invented. (The simulation already fixes the **seeker** roster this way; the cast is
the chronicler's analogue for the figures and places _it_ mints.)

**Framing** — One trial's authored substance within a **treatment**: the concrete situation the
per-trial narrator _dramatizes_ rather than inventing cold. It supplies enough for the trial to read
as a caused event in the larger story — say, its real **obstacle**, why that bars the **goal**, how
the trial's **approach** met it, and what the outcome changes — set against the shared **setting**
and **cast**.

**Palette** **(working name)** — A per-adventure diversity hint, rolled deterministically from the
adventure and offered to the **treatment** as raw material to react to. It nudges along a few
independent dimensions — a biome, a scale, the kind of inhabitants, a derived _adventure type_
(heist, hunt, mystery, …) — to break the model's tendency to collapse every setting onto one
prototype. Which dimensions it rolls, and how hard the hint is imposed (loose suggestion vs hard
constraint), are tunable.

**Setting** — The world a **treatment** fixes for one adventure: a geographic scale and the connected
places its trials happen in, so every passage stands on the same ground instead of each trial
conjuring its own.

**Treatment** **(working name)** — A coherent per-adventure "bible" authored _before_ any trial is
narrated, in one pass over the whole adventure: a fixed world and cast for the telling to draw on,
settled up front so the chronicle coheres instead of improvising each beat in isolation. It fixes
whatever the narration needs to stay consistent — things like the **setting**, the **cast** and what
they want, the notable **treasures**, and a per-trial **framing** — with the exact contents following
the design.

**Zoomed narration** — Narrating an adventure one **trial** at a time, each call given the story so
far, then distilling the passages into one finished chronicle — markedly richer than telling the
whole adventure in a single shot. The staged authoring above (**treatment** → per-trial → stitch) is
the matured form of this.

### Compositional scaffolding

**Axis** — A dimension a **snippet** varies on, named by the placeholder it fills. **Register**,
**writing style**, and **invention** are the voice axes today; others get added as the prose gains
dials to turn (how strongly the **palette** is imposed, for one). Axes are orthogonal — any
combination is legal — which is what lets the voice be tuned one dimension at a time.

**Pipeline** — An authored, multi-step narration: a sequence of template calls (with pure transforms
between them) that threads named values through to build a telling — e.g. **treatment** → narrate
each trial → stitch. The unit at which a whole narration _strategy_ is composed and compared.

**Snippet** — One interchangeable filling for a template placeholder, drawn from a pool of
alternatives on an **axis**. It is the unit that makes voice A/B-testable: swap `register` from
legendary to folktale, hold everything else.

**Structured output** — A template call constrained to return validated JSON against a schema rather
than prose. It is how the **treatment** (and the **cast** it names) come back as data the rest of the
**pipeline** can read and bind, not free text.

**Template** — A named prompt skeleton with named placeholders: the fixed contract for one kind of
call (the per-trial narrator, the **treatment** author, …). It is filled from two channels —
**snippets** and runtime data (the **chronicle view**, the **few-shot examples**).

---

## The patron's waking

The **patron** attends the compact only in spells and acts on the world by a single deliberate stroke.
These name that cycle. (Patron, Compact, Dispatch, and Edict have fuller sections to come; see
[metaphysics.md](metaphysics.md) for the workflow and its interface consequences.)

**Awake** — The patron present and attending: the spells in which you read what has come and weigh what
to send, and the compact settles around your regard. The waking state.

**Asleep** — The patron absent between wakings, the regard sunk back. Time passes in the world while you
are Asleep — by an amount neither you nor anyone can predict — and the compact runs on its standing
**edicts** until you Awaken.

**Awaken** — The patron's return to the **Awake** state at the start of a waking: the regard gathering to
attend, the desk coalescing. A turn begins with an Awaken. (Used as a noun — "the first Awaken.")

**Seal** — The stroke that commits a **dispatch**: it imparts mystical weight to your orders (the
patron's one true lever on the world) and, in the same act, sends the patron **Asleep**. To seal is to
end the waking.

**Fade** — When a patron, once **Asleep**, never Awakens again: the end of a tenure. The regard does not
return, and the compact, after a time, is left to **Call** another.

**Called** — Brought into being by the compact's structural need to be whole: a compact without a patron
is _unwhole_, and the vacancy a **Fade** leaves is itself the summons. A newly Called patron inherits the
last one's standing **edicts**.

---

_Referenced above, with sections of their own to come: Resolver · Adventure log · Edict · Dispatch ·
Seeker · Compact · Charter · Causal graph · Chronicle._

[^retired]:
    Terms that were renamed or dropped live in [glossary-retired.md](glossary-retired.md) — the
    single record of retired vocabulary (e.g. **Covenant**, now **Compact**).
