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
- **Two kinds of secondary.** Beside the primary sit either **content panes** (a summoned ledger, a docked
  dossier — they carry content) or **affordance edges** (the receded missive pile — *content-stripped*,
  present only to show what remains and to step to it). Both are co-present, but only **content panes** count
  toward the ~2-slot bound; an edge is a wayfinding remnant, not a pane competing for focus.
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

## Responsive — a minimum width, gated in-world

The deciding surfaces (Board, party-building, Dispatch) are **compare-tables**, and their whole value is
*simultaneous* side-by-side weighing — which needs width (2-up minimum) and holds only at **tablet and up**.
Collapsing them to a phone (swipe-one-at-a-time, comparison by memory) throws away the one decision the game
is built around. So rather than contort the core mechanic to fit a phone, Farwatch sets a **minimum width**
and **gates** below it. It's a game, not a form to fill out — it can ask for the screen it needs.

- **Below the minimum the game does not run — but the gate is diegetic**, not a sterile requirements error:
  the steward turns you away in-voice ("there is no room on this small glass to lay the dossiers out, my
  lord — this is desk-work; come back to a wider table").
- **Minimum is tablet-width** — the 2-up compare-table floor. Phones fall below it; tablets and desktops
  clear it.

*Designed-for, deferred — reading on a phone.* The **reading** half (the missive pile, chronicles, a fact
summoned inline) genuinely *would* travel: Document degrades cleanly — a fact can't dock *beside* on a narrow
screen, so it **unfolds inline** under the line that named it, prose-index intact. The reason to unlock
phone-reading later is **re-engagement** — a returned chronicle is the game's best "come back" hook, and the
phone is where that lands. Until a "word has arrived" loop makes it worth the responsive work, one gate is
simpler and on-brand; when it's unlocked, the gate **narrows** from *the game* to *the deciding surfaces*
only.

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

---

## Visual WIP — current values (mockup spike)

**Status: WIP, not final.** Concrete values arrived at while iterating the mockups — captured so the spike
can be picked up later. The leading direction is **hybrid**: *warm paper documents on a cool, smoke-and-stone
room.* Authority for the live look is the mockup files, not this list; values here are a snapshot.

> The sections below catalogue the **mechanisms** (the CSS recipes and tokens). The **entity model** they
> assemble into — *document = author × occasion × paper × ink* — is its own document:
> **[document-styling.md](document-styling.md)**. Read that for *what owns what*; read here for *how each
> piece is built*.

- `mockups/compare-table.hybrid.html` — the party-building compare-table (the fullest realization).
- `mockups/reading-first.warm-melancholy.html` — the reader (paper/ink/type reference).
- `mockups/reading-first.hybrid-field.html` — the reader's paper set on the hybrid field (smoke + desk-pool).
- `mockups/paper-swatches.html` — paper-tone + role-colour swatches.

**Core principle — two materials, two temperatures.** *Warmth = paper (things authored in-world); cool =
room/chrome (the system, the distance).* Anything the player or the compact wrote is warm parchment; anything
that's apparatus (the field, the going-tray) is cool and textureless. The warmth ends exactly at the chrome.

**Palette**
- *Warm documents* — paper `#e2d1a3`; ink `#2c2012` (~10:1); meta/stamp `#463a22` (~7:1, small-caps);
  voice `#4a3a22` (italic); loss/oxblood `#7a2f25`; gold `#99713a` (dim, sparing).
- *Cool room/chrome* — field is a radial `#34373a → #25282b → #1a1c1e` on `#181a1b`; going-tray `#2b2e30`
  with light text (`#d2d7d9` / meta `#8f9598`); cabinet inks (where chrome carries text) cool greys.
- *Accent* — the dispatch action is oxblood (`--loss`), rhyming with the charge; it's the one saturated note
  in the chrome.

**Typography — four roles + a semantic.** Body = `--ink` roman; Voice = `--voice` italic (the steward, the
said); Meta/Stamp = `--meta` small-caps (datelines, labels); Control = `--gold`, reserved for interactivity;
Loss = `--loss` oxblood (semantic, not decorative). Face: **EB Garamond** (runs ~85% apparent size). Reader
body 20px / line-height 1.7; documents in the denser compare-table hold line-height ~1.5. Headers are *written*
(hand-underlined ink), not printed small-caps tags.

**Paper (the full recipe — all three layers).** `--grain` (fine fractal noise, opacity ~0.55) **+** `--laid`
(anisotropic noise, `baseFrequency 0.01 0.42` → directional fibre/laid lines, opacity ~0.26) **+** a warm
top-glow radial. Ink "bloom" = `text-shadow: 0 0 0.7px rgba(48,22,8,0.5)`. Discretionary ligatures on. The
laid layer is what stops paper reading as a flat tinted rectangle.

**Torn edges.** A displacement-map mask (`--torn`) + `drop-shadow()` (so the shadow follows the ragged edge,
not a rounded box). Reader sheet uses scale 14 / inset 16; the table's documents scale 12 / inset 14. Wide-
short papers (the charge) need the mask **oversized horizontally** (`mask-size: calc(100% + 46px) 100%`,
centered) or the ~2.3% inset eats ~26px/side. **Gotcha:** `feDisplacementMap` must set
`xChannelSelector='R' yChannelSelector='G'` (default is alpha → near-uniform noise → glitchy displacement).

**Handwritten marks (the roster checklist).** The box is a per-row **generated** bowed-pen path (jittered
corners ±0.4px, gently bowed sides, slight overshoot at the close, stroke-width 1.5–1.85) — *not* one shared
stamp, or it reads as a repeated glitch. The check is an oversized bowed `×` (bigger than the box, overflowing
it), with a stable per-seeker random rotation of **±10°**. Both carry only a tiny displacement for grain;
geometry carries the "hand."

**The room — smoke field + desk-pool.** Two tileable mist layers (`--mist`/`--mist2`, different seed/freq)
drift one tile per cycle on **different diagonals** (seamless, non-reversing, periods 102s/138s so they never
realign). Tileability requires `stitchTiles='stitch'` **and** the filter region pinned to the box
(`x=0 y=0 width=100% height=100%`) or the stitch period won't match the repeat period (visible breathing
seams). Honors `prefers-reduced-motion`. *(A faint feathered radial **desk-pool** behind the document cluster
was tried as a way to tie the papers together, but read as distracting — removed, pending a better idea for
grounding the cluster.)*

**Going-tray (chrome).** Belongs to the room, not the paper: dark `#2b2e30`, no drop-shadow (not floating);
separated from the field by a near-minimum inset only (`inset 0 1px 2px rgba(0,0,0,0.14)`, no top border).

---

## The paper recipe

The single most-reused material is **warm paper** (the charge, the roster, the dossiers, the reader sheet,
the fact cards). It had drifted into per-element copy-paste across the mockups; this codifies it. A paper is
built from a small set of **axes**, each with a named library of **options**. A **variant** picks one option
per axis. The canonical encoding is **[`mockups/paper.css`](mockups/paper.css)** (`.paper` + `.paper-v-*`
classes); the live switcher is **[`mockups/compare-table.dynamic.html`](mockups/compare-table.dynamic.html)**
(a dropdown swaps the variant for every paper at once). The tables below mirror that file — read a variant
row left-to-right and you can rebuild it.

**Base (constant across all paper):** the paper **colour** + **ink** (from the colour pairing), the
**ink-bloom** halo (now an ink-style concern), and discretionary ligatures. The axes below are what a paper
*style* variant tunes. *(An "edge-soak" inset-darkening was tried and removed — it shaded the paper toward
its edges, which read as a colour shift rather than the aging it was meant to suggest.)*

### Axis option libraries

**Grain** — fine fractal-noise paper tooth (a tiling background layer):

| slug | params | key element |
|---|---|---|
| `none` | — | no tooth; flat colour |
| `fine` | fractalNoise `0.8`, 2 oct, opacity **0.55** | the standard tooth |
| `soft` | fractalNoise `0.8`, 2 oct, opacity **0.50** | the same tooth, a hair lighter |

**Laid** — anisotropic noise: directional fibre / laid lines (a tiling layer):

| slug | params | key element |
|---|---|---|
| `none` | — | no fibre |
| `fibre` | fractalNoise `0.01 0.42`, opacity 0.26 | close, slightly-irregular **laid** lines (turbulence). Two strengths (`fibre` / `faint`) |

The perpendicular **chain** lines (the thicker cross-wires) are a **separate layer** on `.paper` —
a `repeating-linear-gradient` driven by `--paper-chain-alpha` (off at `0`) and `--paper-chain-gap` (spacing).
Laid and chain thus tune *independently in strength*, though presets keep them *coupled in presence* (same
mould — vellum & wove have neither).

**Glow** — a warm top-of-sheet light wash (a gradient layer):

| slug | params | key element |
|---|---|---|
| `none` | — | no warm wash |
| `candle` | radial 120%×55% @ 50% −10%, peak **0.28** | the reader's warm top light |
| `candle-soft` | radial 120%×60% @ 50% −12%, peak **0.22** | a fainter wash (table docs) |

**Tear** — a displaced edge mask (ragged "torn from a sheet" outline):

| slug | params | key element |
|---|---|---|
| `none` | — | clean rectangular edge |
| `torn` | displace **12**, inset 14, blur 0.50 | the table-doc tear |
| `deep` | displace **14**, inset 16, blur 0.55 | a rangier tear (reader sheet) |

*(Modifier: wide-short papers like the charge need `--paper-tear-size: calc(100% + 46px) 100%` so the ~2.3%
inset doesn't eat their width.)*

*(**Shadow / lift** — the paper's elevation drop-shadow — is **parked**, not currently applied by any style;
the `--lift-*` tokens are kept in `paper.css` so it's a one-line re-add when we tune elevation later.)*

### Style variants in play

One row per paper *style*. **Colour is a separate dial** (next section) — these set only texture and edge.
Cells name the option chosen on each axis.

| style variant | status | what it is | grain | laid | glow | tear |
|---|---|---|---|---|---|---|
| `worn-bright` | **in play** | bright worn-parchment surface — the table documents (charge · roster · dossiers) | fine | fibre | candle-soft | torn |
| `ledger` | **in play** | duller worn-ledger surface — the reader's reading page | fine | fibre | candle | deep |
| `card` | **in play** | small index / fact card — no warm wash | fine | fibre | none | torn |
| `austere` | *proposed* | pruned — tooth only, straight edge, no warm wash (the "remove things" test) | soft | none | none | none |
| `clean` | *proposed* | flat baseline — no texture/tear (the control) | none | none | none | none |

*`austere` and `clean` are deliberate test rows (not yet a rendered design) — they exist so the dynamic
mockup can A/B "how much of the texture is actually load-bearing" against the full recipe.*

---

## Paper & ink colour (the second dial)

Colour is split out of the paper *style* so it moves independently — but the player only ever sees **curated
pairs** of a paper-colour and an ink-colour. Canonical encoding:
**[`mockups/paper-color.css`](mockups/paper-color.css)** (`.color-*` classes). Both the
[dynamic table](mockups/compare-table.dynamic.html) and the
[dynamic swatch sheet](mockups/paper-swatches.dynamic.html) carry a colour selector. Hue and strength are
split: the **paper** supplies the fill; the **ink** supplies the writing colour + bleed *hue*; the bleed
*strength* comes from the ink style.

*(Type-role accents — voice / stamp / loss / gold — are **not** part of the paper/ink pair; they're a
separate future "accent palette" dial, held constant for now.)*

### Paper-colour options

| slug | fill | key element |
|---|---|---|
| `ledger` | `#d9cca6` | dull worn ledger |
| `parchment` | `#e2d1a3` | warm + bright parchment |
| `amber` | `#e5d1a0` | warmer, more amber |
| `bright` | `#e8d6a4` | the brightest warm paper |
| `card` | `#d3c59e` | a touch greyer — the index card |
| `cream` | `#ece6d2` | cool cream — the wildcard |

### Ink options

| slug | base | bleed hue (rgb) | key element |
|---|---|---|---|
| `sepia` | `#2c2012` | `48 22 8` | the standard faded sepia-brown |
| `soot` | `#201f18` | `20 20 14` | sharper, cooler near-black — the cabinet hand |
| `faded` | `#5a4a30` | `60 44 24` | very worn — a light, ghosted ink |

### Curated combinations

One row per pairing. The selectors offer exactly these.

| name | paper-colour | ink | what it is |
|---|---|---|---|
| `warm-posting` | parchment | sepia | the table documents — bright parchment, sepia ink |
| `worn-ledger` | ledger | sepia | the reader's reading page — duller paper, faded sepia |
| `amber-warm` | amber | sepia | candle-flushed, warmer |
| `bright-clean` | bright | sepia | the brightest warm paper |
| `cabinet` | cream | soot | cool cream + sharp near-black — organized, slightly cold (the wildcard) |
| `ghostly` | ledger | faded | very worn — faded ink on dull paper (an atmospheric extreme) |

Any style × any colour is valid; the named pairs are the curated, sensible ones. A paper is fully specified
by **one style variant + one colour combination** — e.g. the table documents today are `worn-bright` ×
`warm-posting`; the reader is `ledger` × `worn-ledger`.

---

## Ink style (the third dial)

The non-colour properties of the writing: **face · slant · weight · size · bleed**. (The ink's *colour* +
bleed *hue* are the second dial; this sets everything else, including the bleed's blur + strength.) Canonical
encoding: **[`mockups/ink.css`](mockups/ink.css)** (`.ink-*` classes). The
[dynamic table](mockups/compare-table.dynamic.html), the
[colour swatches](mockups/paper-swatches.dynamic.html), and the dedicated
[ink swatches](mockups/ink-swatches.dynamic.html) all carry an ink selector.

Paper text is **em-relative** (every size in the document is `em`, anchored to `.paper { font-size:
var(--ink-size) }`), so the size axis scales the whole block as a unit rather than each element separately.

### Axis option libraries

**Face** (font-family):

| slug | family | key element |
|---|---|---|
| `garamond` | EB Garamond | the chosen humanist book-serif |
| `spectral` | Spectral | cooler, more severe — the austere face |
| `crimson` | Crimson Pro | a scholarly book-serif |

**Slant** — *dropped.* The body is never italic; the only italics are the **voice / signature** type-role
accent, which is independent of the ink dial.
**Weight** — explored across `300`–`800` (100 steps) in the ink-swatch grid. (EB Garamond has no 300, so it
falls back to 400 there; Spectral and Crimson Pro carry the full range.)

**Size** (base paper-text size; the block is em-relative so it scales together). The named anchors below are
the early presets; the ink-swatch grid sweeps a wider range (`0.95`–`1.9rem`), since the settled reading size
turned out to sit *above* what the named presets reached:

| slug | value | key element |
|---|---|---|
| `compact` | `1.0rem` | the dense compare-table |
| `reading` | `1.1rem` | a first reading-size preset |
| `large` | `1.22rem` | a larger reading preset |

**Bleed** — the ink-soak halo (`text-shadow`); colour comes from the ink, blur + strength from here. With the
ink cycle on, these are the bloom **at full ink** (the ceiling) — the per-word reservoir level scales it down
for dry marks (see *Ink cycle → Bloom rides the reservoir*). With the cycle off, it's a uniform halo.

| slug | blur · alpha | key element |
|---|---|---|
| `none` | — | crisp, screen-sharp ink |
| `light` | `0.6px` · `0.4` | a faint soak |
| `full` | `0.7px` · `0.5` | the worn-print soak (reader/table default) |

### Ink variants in play

Named presets, one row per ink style (face × weight × size × bleed). The
[ink-swatch grid](mockups/ink-swatches.dynamic.html) sweeps face/weight/bleed/size freely; these are the
shortlist worth naming.

| variant | status | what it is | face | weight | size | bleed |
|---|---|---|---|---|---|---|
| `chronicle` | **in play** | the reader's prose | garamond | 400 | reading | full |
| `posting` | **in play** | the table documents | garamond | 400 | compact | full |
| `monastic` | *proposed* | cooler + severe, no soak | spectral | 400 | compact | none |
| `scholar` | *proposed* | a book-serif alternative | crimson | 400 | compact | light |
| `crisp` | *proposed* | screen-sharp — medium weight, no soak (the "remove the bloom" test) | garamond | 500 | compact | none |

A document is now fully specified by **three dials**: a paper **style** + a colour **combination** + an ink
**style**. Today's table documents are `worn-bright` × `warm-posting` × `posting`; the reader is `ledger` ×
`worn-ledger` × `chronicle`.

---

## Ink cycle (the hand)

An optional overlay that makes the writing read as **ink from a quill** rather than rendered type. It models a
finite reservoir: a fresh dip is dark and slightly heavy; as you write it depletes (thin + pale); at the next
**word boundary** past capacity it re-dips. Each mark's weight/darkness depends on the running reservoir level
— the variance has **memory**, not per-mark noise — with a small random walk for texture and a richer "blob"
on the first mark after a dip. One reservoir level drives **three** coherent outputs: **`text-stroke` =
weight**, **`opacity` = ink darkness**, and **`text-shadow` blur = ink bloom** (see below). Canonical
encoding: **[`mockups/ink-cycle.js`](mockups/ink-cycle.js)**; design surface:
**[`mockups/ink-cycle-designer.dynamic.html`](mockups/ink-cycle-designer.dynamic.html)**.

**Bloom rides the reservoir.** Ink-bloom (the soak halo, an `ink-style` bleed dial) is *not* a separate
constant overlaid on the cycle — it's the same physical variable (how much wet ink is on the nib). So the
cycle modulates it: the bleed dial sets the bloom **at full ink** (the ceiling), and the per-word level scales
it down for dry marks — halo **blur** ∝ level (explicit), halo **alpha** ∝ darkness (via `opacity`). Fresh
marks bloom bigger + stronger; dry marks barely feather. (Before this, the bloom was a flat overlay and only
got *accidentally* dimmed by the per-word opacity — the radius never responded, so wet and dry marks wrongly
shared a halo size.)

Two properties matter for the eventual game:
- **Per word, not per character.** A per-character variant was tried — but the reservoir's memory makes letters
  within a word nearly identical, so per-character looked the same as per-word *and* cost the font's kerning
  (each letter its own span). Dropped. Word granularity keeps kerning.
- **Deterministic.** The RNG is **seeded from the text**, so a given passage always inks the same way every
  render — otherwise the same document would look different each time it's opened.

### Parameters

| param | what it does |
|---|---|
| `dip length` | characters a dip writes before re-dipping — the sawtooth wavelength (randomised in a range) |
| `floor` | how empty the reservoir runs before re-dipping (lower = more dramatic fade) |
| `weight range` | `text-stroke` max (px) at full ink |
| `darkness floor` | `opacity` when nearly dry |
| `para blob` | extra richness on the first mark of each paragraph (a deliberate re-ink) |
| `dip blob` | smaller extra richness on a mid-paragraph re-dip |
| `walk` | per-mark random-walk amplitude (texture, with memory) |

### Presets

| preset | dip length | floor | weight range | darkness floor | para blob | dip blob | walk |
|---|---|---|---|---|---|---|---|
| `Light` | 45–80 | 0.30 | 0.30 | 0.90 | 0.16 | 0 | 0.03 |
| `Heavy` | 45–80 | 0.30 | 0.22 | 0.90 | 0.35 | 0 | 0.03 |

The preset dropdown (none / Light / Heavy) is offered on the dynamic table and the swatch pages; the full
parameter set is tunable in the **ink-cycle designer**, which can also load a preset as a starting point.
