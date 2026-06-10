# Farwatch — Document Styling System

*The generative model behind how an in-world document **looks**. This is the level above the concrete CSS
recipes: where [`ui-design.md`](ui-design.md) catalogues the **mechanisms** (paper.css, paper-color.css,
ink.css, ink-cycle.js — grain tokens, tear masks, the reservoir model), this doc defines the **entities**
those mechanisms assemble into, so any particular document can be **composed** rather than hand-styled.*

> **Status:** a starting-point model. Some of it is wired today (the cross-references say where); some is the
> target the parameters are *moving toward*. Flagged inline as **[wired]** / **[target]**.

---

## The shift

We are moving from designing **one visual style** for all documents to a **parameterized document builder**.
A document is not a style — it is a **collision of four independent things**, and the final look (especially
the bleed) is often a *product* of several, owned by none:

> **document = author × occasion × paper × ink**

— *who* wrote it, under *what conditions*, on *what surface*, with *what medium*.

**The ownership rule.** Each property belongs to the physical thing that owns it; rendering *composes* them.
The test for "where does property X live": *which object would still have X if you swapped the others out?*
Absorbency survives an ink change (it's the paper's); flow survives a paper change (it's the ink's); the face
survives a paper/ink change (it's the author's); the dip-rhythm survives all of them (it's the occasion's).

---

## Paper — the surface

What was written *on*. "What was to hand" when the document was made.

| param | what it is | status |
|---|---|---|
| `color` | the paper fill | **[wired]** `--paper-color` (paper-color.css) |
| `grain` | fine fractal-noise tooth | **[wired]** `--paper-grain` (paper.css) |
| `laid` | directional fibre lines | **[wired]** `--paper-laid` |
| `glow` | warm top-of-sheet light wash* | **[wired]** `--paper-glow` |
| `tear` | ragged torn edge | **[wired]** `--paper-tear` |
| `absorbency` | how readily ink spreads in this stock (blotter ↔ vellum) | **[target]** — today folded into the single `bleed` dial; should become a paper property |
| `lift` | elevation drop-shadow | **[parked]** tokens exist, not applied |

*\*`glow` is really a property of the **scene's lighting**, not the paper — it just renders on the sheet. It
would move if we ever modelled the room's light as its own thing.*

**The paper presets are historically grounded, not arbitrary** — each is a real surface type, with its look
flowing from how it was actually made: **skin** (`charter`/vellum — pale, smooth, *no laid*, trimmed edge,
very low absorbency, the writ/charter) vs **sized laid rag** (`chronicle`, `ledger` — cream, laid lines,
deckle edge, absorbency set by the *sizing*) vs **cheap rag** (`field` — greyer, unsized → feathers, rough).
The decisive in-world lever is **sizing → `absorbency`**: a scribe chose hard-sized stock for a fair copy
(crisp) and tolerated blotter-y stock for a scrap. *(Browning/fraying with age is the **Condition** layer, not
a paper type — there is no "aged paper" preset. And a wax **seal** is deliberately **not** a paper property —
it's an authority/document-kind concern for a future axis.)*

---

## Ink — the medium

What it was written *with*.

| param | what it is | status |
|---|---|---|
| `color` | the **fresh** writing colour | **[wired]** `--paper-ink` |
| `bleed hue` | the soak-halo colour (the ink, soaking) | **[wired]** `--ink-bleed-hue` *(renamed from the mislabeled `--paper-bloom`)*; could auto-derive from `color` |
| `flow` | how readily *this ink* wants to spread (thin/watery ↔ thick) | **[wired]** — feeds `bleed = absorbency × flow` in the resolver |
| `fades` | whether the ink ages (iron-gall fades to brown; carbon doesn't) | **[wired]** — read by the Condition layer's `weather()` |

**Historically grounded.** The ink presets are the real families: **iron-gall** (`fresh` blue-black →
`matured` brown-black — the canonical Western ink for a millennium, *fades* to brown with age), **carbon /
lampblack** (dense matte black, a *pigment* — colour-stable, low feather, `fades: no`), and **rubric (red)**
(vermilion — the headings/emphasis tradition that our oxblood accent descends from). `color` is the **fresh**
ink; the browning/fading is the **Condition** layer below, applied only when `fades` is set.

**Not ink:** *weight*. Ink has no stroke width — the pen and the hand do. Stroke weight is the author's face
(font-weight) plus the occasion's pressure (the cycle). It does **not** live here. And *fading* is **not** ink
either — it's a condition (see below); the ink only declares whether it's *fade-prone*.

---

## Author — the hand (persistent)

*Who* wrote it. An author's hand is consistent across every document they write — the steward always writes
in the steward's hand; a seeker's dossier or an old writ is a *different* author.

| param | what it is | status |
|---|---|---|
| `face` | the typeface (stands in for penmanship + the instrument's shape) | **[wired]** `--ink-family` (ink.css) |
| `size` | the author's characteristic letter size | **[wired]** `--ink-size` |
| `weight` | the face's base weight (the pen's nib) | **[wired]** `--ink-weight` |
| `slant` | upright vs italic body | **[dropped]** — the body is never italic; italics are a *voice* type-role accent, not the author |
| `neatness` | the author's baseline care (could scale the occasion's variation) | **[target]** |

*The typeface is doing double duty here — it encodes both the **penmanship** (letterforms) and the
**instrument** (nib width/contrast). If we ever wanted one author to use different pens, instrument would
split out; for now, face-as-author is enough.*

---

## Occasion — this writing (transient)

The *conditions* of this particular document — the same author, on a bad night vs a calm afternoon, looks
different here and only here. This is **the ink cycle** ([`ink-cycle.js`](mockups/ink-cycle.js)).

| param | what it is | status |
|---|---|---|
| `dip length` | characters per dip — how full the inkwell ran | **[wired]** `dipMin`/`dipMax` |
| `floor` | how dry it runs before re-dipping | **[wired]** `floor` |
| `weight range` | pressure variation (stroke) | **[wired]** `strokeMax` |
| `darkness floor` | ink darkness when dry | **[wired]** `opacityMin` |
| `para blob` / `dip blob` | the fresh-dip richness | **[wired]** `blobPara`/`blobDip` |
| `walk` | hand unsteadiness / speed texture | **[wired]** `walk` |

*Narrative mapping: a chronicle written **in haste after a death** → faster, lower `floor`, higher `walk`; a
**calm seasonal report** → smooth, wet, even. Same author, different occasion.*

---

## Condition — what happened since (the second layer)

The four entities above are **composition** — the *ingredients*, fixed at the moment the pen lifted. **Condition**
is a different *kind* of axis: a **modifier applied to the finished document** — what time and handling did to
it *afterward*. The model is two layers:

> **document = weather( compose(paper × ink × author × occasion), condition )**

| param | what it is | status |
|---|---|---|
| `age` | how long ago it was written (fresh → ancient) | **[wired]** — `weather()` in `document-model.js` |
| `wear` / `damage` | handling, creases, water-stains, foxing, ink-burn | **[target]** — siblings of `age`, same layer |

**Why it can't live on an entity:** age is *cross-cutting* (it browns the paper, frays the edge, degrades the
sizing → raises absorbency, **and** fades the ink) and its effect is *conditional on the materials* — **iron-gall
fades, carbon doesn't**; a hard-sized sheet resists, a cheap one degrades. A property that has to *inspect other
entities to know what it does* is a layer above them, not one of them. `weather(resolved, age)` therefore runs
**after** `compose()`: it lerps the paper fill toward a tan, fades fade-prone ink toward brown, nudges absorbency
up, and frays the edge — all proportional to `age`.

This is why there is **no "aged paper" preset and no "faded ink" preset** — those baked a *condition* into a
*material*. An old record is `chronicle (laid rag)` × `iron-gall` × **`age: ancient`**. (It also keeps *fading*
distinct from *dilution*: a pale mark is either weak ink — a creation-time `flow`/concentration choice — or old
iron-gall — `age`. Same look, different cause.)

---

## Derived — bleed (owned by no one)

Bleed is the clean example of a property that is *composed*, not owned:

```
bloom ceiling (at full ink) = paper.absorbency × ink.flow      [wired]   (compose() in document-model.js)
                              (age raises absorbency first → an old sheet feathers more)
per-mark bloom              = ceiling × occasion.cycle-level    [wired]   (ink-cycle.js scales it per word)
bloom hue                   = ink.bleed-hue                     [wired]   (--ink-bleed-hue; ages with the ink)
```

So "this ink on that paper" *should* produce the right feathering automatically (absorbency × flow), with the
occasion's reservoir modulating it per mark. Today the ceiling is set directly by a `bleed` dial
(`--ink-bloom-blur` / `--ink-bloom-alpha`) that conflates absorbency and flow — the next refactor splits it.

---

## How a document is assembled

A document is a **tuple — one option from each entity's library**:

> `chronicle (laid rag)` paper × `sepia` ink × `steward` hand × `measured` occasion

The libraries already exist as the mechanism files — `paper.css` (paper styles), `paper-color.css` (paper+ink
colour pairs), `ink.css` (author hands), `ink-cycle.js` (occasions). The builder is the act of picking one of
each.

**This model is now executable.** [`mockups/document-model.js`](mockups/document-model.js) holds the entity
libraries as **data** (`SCHEMA` + `PRESETS`) and the resolver `compose(spec)` — which is where the derivation
`bleed = absorbency × flow` lives, *in script, not CSS calc()*. The composer that picks one option per entity
is [`mockups/document-designer.dynamic.html`](mockups/document-designer.dynamic.html): a tab per entity with
per-entity save/load presets. This is the first surface built on the **data + resolver, CSS-renders** approach
(see *ui-design.md*'s note); the older per-effect designers still drive the CSS-class libraries directly.

---

## Open boundaries (deliberate, not yet settled)

- **Size & face: author or occasion?** Leaning **author** (a hand's habit) — but a *formal* writ is bigger
  regardless of who wrote it, which is occasion-ish. The cleanest split is probably author owns the *default*,
  occasion can *override*.
- **Colour pairing.** Today paper-colour and ink-colour are bundled as a curated *pair* (`paper-color.css`).
  In the entity model they're two axes (paper.color, ink.color) — the pair is just a sanctioned default.
- **Absorbency × flow vs one bleed dial.** The split is the right model; the single dial is the pragmatic
  current state. Worth doing when bleed needs to differ by paper *independent* of ink.
- **Glow = lighting, not paper** (see above).
