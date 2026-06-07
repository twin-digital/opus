# Farwatch — Metaphysics (draft)

**Draft — current thinking.** The patron's nature and the **waking cycle**, and the interface work the
cycle implies. The settled frame lives in [design-deep.md §8 "The patron (you)"](design-deep.md) (the
_Hollow Crown_, presence/absence as the regard, the _wheel of patrons_, fade-endings, devotion); this
doc extends it with the present/absent vocabulary and its UI consequences. The terms are fixed in
[glossary.md](glossary.md) — **Awake, Asleep, Seal, Fade, Called.** Deliberately thin: enough to drive
the workflow and the UI, not a lore bible.

## What the patron is

An **incorporeal regard**, not a body **in the compact's world** — a _Hollow Crown_ called by the
compact's structural need to be whole. Its tie to that world is **tenuous and unreliable**. The
**compact** is dependent on _it_ — a compact without a patron is _unwhole_ — and **that dependence is the
source of your authority: it is why a sealed word carries weight and is heeded at all.** (Whether the
patron in turn needs the compact is left open — buried lore.) Perhaps only the **steward** perceives the
patron (open). The patron touches the world by exactly one means: the **Seal**.

## What the patron perceives — the desk

The desk, the letters, the wax seal — everything the patron handles — exist **as perceived by the
patron's consciousness**, not as objects in the compact's world. **No desk stands in that world**; no
seeker sees one; the steward never sits across it. The desk is the _form the regard gives to attending_,
not a place. This is what reconciles "incorporeal" with "turns a page, presses a seal": those are
gestures of **apprehension, not of flesh**.

Two crossings, and only two, pass between the patron's perception and the world:

- **In** — reports reach the patron and are perceived as **letters** (the steward's delivery across the
  tenuous link).
- **Out** — the **Seal**, the single act that crosses _from_ perception _into_ the world, imparting
  mystical weight. Reading, the page-turn, handling a slip — all of that stays wholly within perception.
  (So when a fact on your desk _ticks_ as you take a costed offer, that is a change to your **picture**,
  perception-side — the world's coffer moves only when the Seal crosses.)

The perception **coalesces as the patron Awakens and dissolves as they Seal and go Asleep** — which is
why a waking is "surfacing, a little disoriented": the desk is _assembling_ around the returning regard,
not waiting in a room. The regard's **command** of this perception is _learned_: newly **Called**, it can
barely hold focus and is _swept_ along, able to attend only to what is set before it; with practice it
learns to **summon** at will, then to move freely. (Interface consequence: this is the navigation curve —
disorientation strongest at the Founding, easing with mastery — see [ui-design.md](ui-design.md).) Whether this is a body's desk somewhere else (_body-anchored-elsewhere_) or a
bodiless mind's rendering (truly _no_ body) is **left open** (design-deep §8); the only commitment is
that it is the patron's perception, never the compact's world. (Interface consequence: the desk should be
rendered as _coalescing, luminous apprehension_, never photoreal furniture — see
[ui-design.md](ui-design.md).)

**Discipline (from design-deep): _what you are_ is buried lore, never a question the game asks.** The
cycle below is _enacted, never explained_ — the player feels the rhythm; the metaphysics accretes for the
curious. No lore dump on day 1.

## The waking cycle

The loop of a tenure, and the spine of a turn:

> **Awake → read & decide → Seal → Asleep → (unknown time) → Awake → …**

- **Awake** — the patron present and attending: you read what has come and weigh what to send; the
  compact settles around your regard.
- **Seal** — committing a **dispatch**. It imparts mystical weight to your orders (your one causal lever
  on the world) and, in the same stroke, sends you **Asleep**. Sealing _ends the waking._
- **Asleep** — the regard sunk back. **Time passes in the world by an amount no one can predict** — not
  even you. The compact runs on its standing **edicts** until you Awaken.
- **Fade** — an Asleep patron who never Awakens: the end of a tenure (design-deep's fade-endings). The
  compact, in time, **Calls** another, who inherits the last patron's standing edicts.

So the turn boundary is metaphysical, not a button: you do not "end turn," you **Seal and go under**, and
the world returns you at the next juncture that needs you.

## Edicts govern your absence

Because the compact self-runs while you are **Asleep**, your standing **edicts** are _what governs it in
your absence_ — not per-trip orders but the **autopilot for the gaps**. (A **dispatch-limit** on a single
trip — _"to the cold light, no farther"_ — is the per-trip lever, a different thing entirely; see
[ui-design.md → Dispatch](ui-design.md).) This is the deep reason edicts persist (see
[ui-design.md → Edicts](ui-design.md)). The longer the Sleep, the more the compact runs on
your last word — which is also the hook for the eventual "the world progresses while you're away"
behavior: a long real-world absence is simply a long Sleep.

## UI implications (what this needs)

The cycle is not only lore — it dictates real interface work:

- **Awaken (waking in)** — a session opens with the patron _gathering to attend_, not an instant
  dashboard: a paced arrival to the Desk, the steward greeting you. Tone: surfacing, a little
  disoriented.
- **The "what came to pass" recap** — while you slept the picture moved (chronicles returned, facts
  ticked). Waking must surface _what changed_ — the waiting missives, the altered chrome — without a
  lecture. This is the natural home of the reading-first opening beat of every turn.
- **Seal → fade (going under)** — sealing triggers a deliberate **fade-to-black** that ends the visit.
  The seal ceremony and the fade are one gesture.
- **The time-jump** — between Sleep and Awaken, _variable, unknown_ time elapses; the engine returns you
  at the **next meaningful juncture** (the quest resolved, the party unable to assemble, a crisis). The
  Season/clock advances in chunks you did not watch — uncertainty about how long is itself in register
  ("some time has passed," not a tally you controlled).
- **Long Sleep (later)** — a long absence returns you to _more_ having happened (perhaps several
  expeditions run on edicts); the recap scales up. The architecture must not assume one expedition per
  waking.
- **The Founding is the first Awaken** — the cold open is the patron's first waking; it teaches the cycle
  by performing one full **Awaken → Seal → Sleep**, ending on the first fade-to-black.
