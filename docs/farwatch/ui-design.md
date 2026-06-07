# Farwatch — UI design

**First draft, in progress.** How Farwatch's surfaces are *realized* on screen — the navigation model, the
**pane system**, the **surface grammars**, and the look & feel. The *what* of those surfaces (what each is,
what it must convey, what the player does, what's deferred) lives in **[ux-design.md](ux-design.md)**; this
doc is the *how*. Vocabulary is in [glossary.md](glossary.md); the game itself in
[game-design.md](game-design.md) / [game-design-deep.md](game-design-deep.md).

Audience: whoever builds the player web app — a *separate* surface from the dev `inspector`.

> **Split from the original `ui-design.md`.** That doc was mostly UX (surfaces, requirements, experience
> principles) and is now [ux-design.md](ux-design.md); this one holds the genuine UI realization. A few of
> ux-design's surface sections still straddle the line (their *realization* details belong here) and are
> being decomposed lazily, as each grammar gets mocked — see the header note in ux-design.md.

> **Look & feel is deliberately deferred** to a visual pass — see the parked draft at the bottom, and the
> [mockups](mockups/).

---

## The frame — attention, not navigation

The patron is an incorporeal regard ([metaphysics.md](metaphysics.md)); it does not *go* anywhere, it
**turns its regard**. Navigation is therefore **attention, not space**: what the regard attends to
coalesces into the light, and what it turns from recedes into the dark. The **reading is the screen** and
**nothing is parked** — a surface is *composed for the task at hand* (a single document to read, a spread
of papers to weigh — see [The pane system](#the-pane-system)), never ringed by persistent chrome. There is
**no nav rail and no HUD strip**: a persistent strip is the one thing that cannot coalesce, so it would
read as exactly the readout the [fog model](ux-design.md#truth-and-your-picture-of-it) swears off —
persistence is itself a claim of machine-truth.

**The corridor is the Founding's on-ramp, not a permanent mode.** A newly-Called regard can barely hold
focus — it is *swept* — so the **first awakening** ([the Founding](ux-design.md#the-founding--the-first-awaken))
runs **on rails**: a single guided **procession** advanced by the **page-turn** — finish the founding
prospect and the Board rises; choose, and the Roster; assemble, and the Dispatch; **seal**, and you fade.
You are *carried* because you cannot yet steer, and it teaches the cycle by walking you through one.

**Then the corridor dissolves into freedom — quickly, within the first session.** As the regard steadies
you step off the rails and turn among the surfaces at will (Board ↔ Roster ↔ a standing fact). This lands
at **[Alpha-1](ux-design.md#milestones)**, the first cut past the walking skeleton — soon, not far-off;
the rails are training wheels, taken off fast.

**Later awakenings open on a soft current, not a corridor.** A waking still *begins* in a natural order —
the returned **chronicle**, then the steward's update, then the new postings — but that opening is a
**suggested sequence you may step out of** at any point, never rails. The current orients you; it does not
hold you.

**Facts are summoned, not parked — the writing is the index.** A fact surfaces two ways, neither a toolbar:

- **Primary — the prose is the reach-point.** Where the writing *names* a fact, that phrase is the handle:
  "the strongbox came home heavier" raises the **ledger**; "no frost would touch it… at first snow" the
  **almanac**; "what you sent them to do" the **charter**. The text you are already reading is the
  navigation — maximally diegetic, and it vanishes entirely when unused. No persistent marks.
- **Fallback — one steward-held door.** The prose can't always name a fact (a quiet tiding never mentions
  coin), so the standing facts stay reachable through **one** affordance, hung on the
  [**steward**](ux-design.md#the-steward--your-voice-on-the-ground) — the single in-world presence allowed
  to hold "what's always true." Reach for the steward (their mark, or one thin marginal gutter beside the
  sheet) and the facts rise as **named artifacts** — the almanac, the ledger, the writ — each in its
  keeper's hand with the fog intact. *Not* three corner glyphs: a glyph-row is a toolbar (it scans as
  chrome, needs a legend, floats with no speaker, and regrows a rail when Standing/Bonds add a fourth). One
  door scales by putting another artifact *behind* it.

What a summon *does* — lay the fact **alongside** the reading as a pane (not popped over it, not a
whole-view swap) — is [The pane system](#the-pane-system), below. (A summoned fact's label is the
**fact-name** rendered as its artifact: Charter → a sealed writ, Ledger → a ledger, Season → an almanac.
This makes "authored artifact, never HUD" literal: a fact you *call up* can be fallible in a way a parked
value cannot.)

In the **Founding**, routing facts through the prose and the steward is the regard *not yet* summoning at
will — the writing and the steward do the holding (the steward is the prosthetic for the still-unfocused
regard). As the regard steadies the player summons more freely, but the prose-index and the steward's door
**remain** the diegetic spine — they are how a fact stays an *authored artifact* rather than a recalled
HUD, not merely a beginner's crutch.

**The one resting mark is earned by stakes.** A deadline about to bite — the lien at first snow — may let
the almanac make itself *faintly felt, unbidden*, rather than waiting to be reached for. A mark earned by
urgency, not a permanent menu glyph.

**Within the reading, two gestures carry it** — the **page-turn** (advance, reveal the next beat) and the
**seal** (commit, and fade). Everything *in* a document is reading; moving *between* surfaces is the
attention-shift above.

The surfaces still exist — **Missives · Board · Roster · Counsel** *(deferred)* **· Dispatch** — and in the
**Founding** they are **stations of one procession**, reached by turning pages. After it, the steadied
regard turns to them freely — still never *rooms in a menu*, always attention shifting.

---

## The pane system

The principle beneath every surface, and what replaces a bald "one thing in focus": **a bounded set of
co-present panes, composed for the task, nothing parked.** A surface is one *primary* pane plus a small,
bounded set of *secondary* panes — never a single locked view, never a freeform desktop, never a persistent
strip.

This is the resolution of the popup-vs-swap problem. A summoned thing is **laid beside** what you were
reading, not popped *over* it (a modal) and not *replacing* it (a swap) — because you genuinely need two
papers at once: two dossiers against a hazard, the prospect while you pick the party, the ledger while you
read the line that named it. The desk affords exactly this; insisting on a single visible surface was
pretending attention is single-threaded, which it isn't.

```
  ┌────────────────────────────┬──────────────────┐
  │                            │  ┌────────────┐  │
  │   the letter you hold      │  │ the ledger │  │   secondary slot —
  │   — the chronicle —        │  │ 200, more  │  │   a summoned doc docks
  │                            │  │ or less    │  │   HERE, beside, not over
  │   "...the coffers came     │  │ lien: snow │  │
  │    home lighter..."  ──────┼─▶│ let it lie │  │
  │                            │  └────────────┘  │   up to ~2 slots; a third
  │        turn the page >     │                  │   pushes the oldest to recede
  └────────────────────────────┴──────────────────┘   (set down, recallable)
          primary pane                secondary pane(s)
```

Rules that hold across every surface:

- **Bounded, not freeform.** A primary plus ~2 secondaries. Summon past the bound and the oldest secondary
  **recedes** — set down, recallable — never an unmanaged litter of windows. The player composes the
  *decision*, not the *window layout*. (Freeform drag-arrange is the deferred spatial-desktop; it solves
  comparison friction only by adding arrangement friction.)
- **Summoned, not parked.** Panes appear for the task and dissolve when it ends (on seal, or "let it lie").
  The anti-HUD kill survives: task-scoped scaffolding is not a permanent readout.
- **Co-present, not swapped.** No veil, no modal, no whole-view swap — the second thing lies beside the
  first.
- **Motion is local to the pane.** A summoned pane may coalesce into its slot and dissolve when set down,
  but the primary reading **never dims, blurs, scales, or scrims** beneath it. The only *global* transition
  is the waking boundary itself — the desk coalescing on **Awaken**, the fade on **Seal**
  ([the waking cycle](metaphysics.md)). (This is what the removed whole-view scrim/fade got wrong: it made
  every summon a global event. "Dissolve," everywhere in this doc, means the *pane* dissolves — not the
  background.)
- **Reading vs. working — two compositional modes.** The **reading** is a held sheet (singular, immersive,
  paced — a primary doc with a slot or two for facts). The **deciding** is a laid-out table (comparative —
  an anchor, a compare lane, a selection). The desk holds both; a surface is composed for whichever it is.

---

## Surface grammars

Every surface is one of a few **grammars** — reusable pane-compositions, parameterized per task (the way
[the Founding](ux-design.md#the-founding--the-first-awaken) parameterizes the recurring waking). Naming the
grammars means we mock the *grammar*, not each screen.

### Document — one reading, multi-pane

A primary document plus a bounded set of secondary slots (the diagram above). Used by a **missive** / the
**chronicle** (paced, page-turn beats) and by **reading a single standing artifact** (the ledger, charter,
almanac). A fact named in the prose docks into a secondary slot beside the primary; the adventure log
(Post-MVP) is a *structured* Document variant (rows of difficulties / rolls / modifiers).

### Collection — a set you present and act on (stack → table)

One grammar at two richnesses:

- **Stack (lean)** — a pile you draw the next item from, which opens into a Document. The **missive pile**:
  `sender · type · subject · read-state` → open. No compare lane, because reading-the-next isn't a
  comparison. Opening a letter enters **reading** mode (singular, immersive): the open letter is the primary
  (itself a multi-pane Document), and the rest of the pile **recedes to a dimmed edge** — a thin stack of
  paper edges at the margin, *content stripped* (no legible sender/subject), present only to show the stack
  remains and to step to the next. **Not** a co-present *content* pane beside the reading — a dimmed *edge*,
  so focus is maximized while the pile stays to hand. (The full `sender · subject · read-state` pile is the
  *working* view you're in **before** opening; once a letter is open you are reading, not triaging.)
- **Compare-table (rich)** — items laid side by side for weighing, plus a selection. The **Board**
  (prospects → pick one) and **party-building** at the **Roster** (seekers → pick N):

```
  ┌──────────────────────────────────────────────────────────────┐
  │ THE CHARGE  clear the barrow · hazard: old wards, the deep dark│ ← anchor: what you weigh against
  ├───────────────┬──────────────────────┬───────────────────────┤
  │ the roster    │  GARRICK             │  MIRELA               │
  │ ─────────     │  soldiered the       │  reads the old        │ ← compare lane: 2–3 laid
  │ ▸ Garrick     │  marches · a blade   │  script · keeps picks │   SIDE BY SIDE (touch a
  │   Mirela  ✓   │                      │                       │   name → it lays in)
  │   Odric       │  "old wards? I       │  "wards are my        │
  │   Sera        │   break doors."      │   trade."             │
  │   Toller …    │                      │                       │
  ├───────────────┴──────────────────────┴───────────────────────┤
  │ GOING: Mirela                  (1 of 3)        [ to dispatch ▸]│ ← forming-party tray (running state)
  └──────────────────────────────────────────────────────────────┘
```

Three regions: the **anchor** (the charge + hazard you choose against — task-parked, gone on seal), the
**compare lane** (dossiers laid side by side, 2–3 at once), and the **selection** (the running decision).
Board-review is the identical grammar — objects are prospects, the anchor is what's on offer, the output is
*pick one* rather than *pick N*.

### Composer — assembly toward the Seal

The **Dispatch**: it gathers heterogeneous parts — the chosen prospect (a Document), the party (a
Collection table), the per-trip limit and the edict-reminder (Controls, below) — and culminates in the
irreversible **seal**. The one authoring surface; it *embeds* the other grammars rather than sitting beside
them as a peer.

### Deferred grammars — named now, so they aren't crammed in later

- **Dialogue — Counsel.** Bidirectional: you ask, **testimony** answers (steward-mediated). Not a fixed
  document you read — a turn-based exchange, so it's its own grammar. (MVP+.)
- **Controls — the edicts document.** Persistent toggles that *set standing state* — not reading, not
  comparison, not a one-shot commit toward a seal. (Post-MVP.)

The **frame** (the steward, the awakening, how you summon and move) is the connective tissue around all of
these — not a grammar itself; see [The frame](#the-frame--attention-not-navigation).

---

## Responsive — reading travels, deciding wants width

The grammars degrade unevenly, and that draws the line: **tablet-and-up for the full system; phone is
reading-only.**

- **Document degrades to phone.** A fact can't dock *beside* on a narrow screen, so it **unfolds inline** —
  the artifact expands directly under the line that named it, pushing the prose down. Co-presence in
  *reading order* is preserved and the prose-index still works. Reading travels everywhere.
- **The compare-table does not.** Its value is *simultaneous* side-by-side weighing, which needs width and
  honestly holds only at **tablet and up** (2-up minimum). On a phone it collapses to swipe-one-at-a-time —
  comparison by memory — which throws away the one decision the game is built around. So the **deciding**
  surfaces (Board, party-building, Dispatch) are **not first-class on phone**.
- **The line:** phone gets the **reading** (the missive pile, chronicles, a fact summoned inline); the
  **deciding** wants a real screen. Not chasing phone-comparison is deliberate — contorting the compare-table
  to fit a phone would cost the core mechanic more than phone parity is worth.

---

## Look & feel — parked draft (to choose visually)

Captured from discussion; **not settled** — to be decided by rendering the surfaces in candidate moods (the
[mockups](mockups/)). The brief so far:

- **Atmosphere over efficiency.** Not a dashboard; an experience that makes you feel the weight of
  stewarding people you can't reach. The opposite design pole from a productivity tool.
- **Typography is the gameplay** — long-form prose you sink into; a real reading face, generous
  measure, *paced reveal* (the cold-open beats arrive like correspondence, not dumped).
- **Diegetic frame** — the patron's desk *as perceived* (not the compact's world, not a nav sidebar);
  surfaces are things on the desk. Render it as **coalescing, luminous apprehension — never photoreal
  furniture** (a physical desk would assert a body the metaphysics leaves open). The desk *assembles* on
  waking and *dissolves* on sealing.
- **Lean into the distance** — governing a far outpost through late dispatches and untrustworthy
  testimony; travel-worn paper, faded ink, warmth at a remove.
- Opening positions: warm-dark low-chroma palette (ink, parchment, candle-gold, oxblood for loss);
  serif/humanist prose face; spacious unhurried density; motion *is* pacing; in-world voice
  throughout (even empty states: "no word has come from the watch").

Candidate mood axis to compare: **austere/monastic** (cold stone, severe) vs **warm/romantic**
(candlelit, illuminated-manuscript) vs **starker** than either.
