# Farwatch — Design Document (v0.1)

_Working title. Project is in ideation; this document captures decisions, leanings, and open questions as of the initial design conversation. Nothing here is final._

---

## Elevator pitch

**Farwatch** is a single-player game with no graphics, played through conversation. You are a patron — a called, mostly-absent presence — who inherits an existing compact of seekers and stewards it not by direct control but by _governance_: you issue standing edicts and dispatch expeditions, then leave, and the world runs without you on its own clock. When you return, you read the saga of what happened in your absence — quests gone right or wrong, seekers who rose or fell, your laws faithfully kept or quietly defied by people with their own wills. The game is about coming to understand an opaque, living thing you only partly control, in a world that persists and evolves whether or not you're watching, populated by other compacts pursuing their own orthogonal ends. It's a techno-arcane game about keeping something alive across time, mostly by trusting it to keep itself.

---

## Founding constraints

These are the original hard constraints the design must honor:

- **No graphics.** (Clarified: this means _the game renders no body/imagery to the player_ — things can be corporeal or visual _in-world_; they're conveyed in prose and structured text, never rendered.)
- **No required real-world correspondence for gameplay** (no mailing, driving, texting, etc.).
- **Must work fully single-player** — no crowdsourcing or multiplayer dependency — though many can play.
- The player should experience **building / shepherding / stewarding / organizing** something, with notes of strategy and/or RPG.
- Ideally feels **integrated with the real world** and online spaces. _(This pillar has since been downgraded — see "Real-world integration" below.)_

---

## 1. Core stance: govern, don't operate

- You are **absent by nature**, so your agency is _standing intention_, not real-time control: edicts, dispositions, and dispatches that bias how the world plays itself out while you're gone.
- Consequences arrive as **narrative you provoked**, never as chores you missed. **Absence generates story, never loss.** Invite return; never punish departure.
- The deepest **verb** is **comprehension** — building a working model of an opaque-but-fair system — but comprehension _serves the story_; it is the deep verb, **not the engagement spine** (see Open Q#2, resolved). Progression is never score, XP, or visible progress bars.
- The world only changes **on a tick**, never on your visit. Your visit sets dispositions the _next_ tick reads. (This is what structurally prevents presence from pumping progress.)

---

## 2. The compact of seekers

- A small cast of **named** seekers (the ones you know and grieve) plus a statistical mass of **anonymous** members.
- **Graduation membrane:** anonymous members can become named by surviving long enough or doing something remarkable — acquiring a history at the moment they earn one. Named seekers who fall become memorials (a name, a grudge, a legacy that persists).
- Seekers go on **expeditions** that resolve as short chains of weighty stat-checks, _not_ tactical combat. The drama is _who you sent_ and _what it cost_, not blow-by-blow mechanics.
- **Permanent stakes:** death is real and irreversible; a lost seeker is a specific, non-fungible loss. This is the single most important thing separating Farwatch from an idler.

### Design guardrails (anti-idler / anti-huge-RPG)

- Decisions should be **rare, weighty, and irreversible** — not frequent and meaningless (idler) nor frequent and micro (tactics game).
- Assets are **specific and non-fungible**; losses are **permanent**.
- The compact **generates its own reasons to act** (restless seekers, depleting resources, omens) so it never settles into equilibrium — but pressure surfaces as a _choice you want to weigh_, not a chore that pings you.
- **No deep stat system** (3–4 legible stats), **no gear/inventory optimization game**, **no tactical combat layer.**
- Richness lives in **accreted history**, not in mechanical systems. Shallow systems, deep history.

---

## 3. Edicts: interpreted-not-executed law

- You govern by **standing conditional directives** ("when SITUATION, prefer ACTION", e.g. "protect the named above the spoils") consulted at two decision points: **quest selection** (which expeditions launch in your absence) and **in-quest junctures** (press on / withdraw / who takes the danger).
- Edicts are **interpreted by the seekers, not executed by a machine** — faithfully or not, depending on the character of who carries them out. **Defiance is the content.**
- Defiance always traces to a **legible cause** (this person, this trait, this pressure), so a broken edict _deepens character_ rather than feeling random. Target the "interpretation-fidelity curve": _usually heeded, occasionally and comprehensibly defied._
- Edicts are **scarce** (a compact holds only so much "law"), **ranked** (you set precedence; collisions are dramatic), and **choosing what NOT to legislate matters** (the ungoverned space is where the compact most surprises you).
- Mechanically an edict is a small structured object: `{condition (tag-predicate), action (bias), priority, weight}`, read by a rules-engine. The resolver gathers matching edicts, orders by priority, applies biases modified by the executing character's traits, _then_ rolls. No LLM in the decision.

---

## 4. The tag genome (the simulation substrate)

- **Everything** — seekers, quests, encounters, items, places, events, even reality — is described in a shared vocabulary of **tags** across a few **orthogonal axes**.
- Candidate axes: **Theme/element** (universal connector), **Temperament/disposition** (agents only), **Domain/competence** (action-kind), **Function/role** (items), **Provenance/origin** (history), **Condition/state** (transient). _Axis count is an open question — lean: axes fixed and few, tags within them float._
- One **resonance operation** (compare two tag-profiles, compute a consequence) powers all interactions: who enjoys a quest, who bonds with whom, who's good at what, what an edict matches. Resonance is **axis-aware** (Theme matches universally; Domain matches demand-to-competence; Temperament matches agent-to-agent and agent-to-edict; Condition modifies).
- **Affinity (desire)** and **competence (ability)** are separate axes over the same tags — creating characters with inner conflict (loves what they're bad at; excels at what they hate).
- Tags are **dense and never exposed to players by name.** An **LLM janitor** periodically prunes/merges tags to hold a _target density_ (keep collisions frequent), but never merges across axes. Density is the physics of whether the web is alive.

### Flavor layer

- Mechanical tags carry concrete **narrative instances** bound at the (entity, tag) pair: "Gerald loves the deep water" vs. "Greta is fond of sea creatures" — same math, different soul.
- Flavor has a **referent** (which aspect — pure narration) and a **stance** (loves/fears/reveres — may couple to a small approach/avoid mechanical axis).
- Flavors are **emergent-first** (minted by events, ideally with provenance pointing at a causal-graph node), **stored once, read forever** (never regenerated — consistency is the point), and **never feed back into the sim** (the sim must be fully playable with all flavor strings deleted).
- Flavor is a **scarce narrative resource** spent on named entities and strong/event-significant affinities — not every binding gets one. Flavor absorbs specificity so the mechanical genome can stay lean.

---

## 5. Emergent character via a web of influence

- The loop: **shared resonant experience → enjoyment → bonds → influence → affinity-drift → changed future behavior.** Seekers are shaped by _who they quest and study alongside_, weighted by exposure — a **web**, not a clean apprenticeship tree.
- Produces **schools** and **culture**: clusters of temperament and edict-interpretation traceable to founders, which you tend but don't author.
- Drift is **slow, partial, and lossy**, with an identity/retention force, so the web doesn't homogenize (everyone converging) or stay inert (no one influencing anyone).
- **Lineage stakes:** a master's character persists in those they trained; a master who dies untrained loses their particular way of being permanently. This generates the self-authored goal of training a successor _before it's too late._

---

## 6. Saga comprehensibility (the engineering spine)

This is the make-or-break system: an absent player returns to outcomes without having witnessed the causes. Reconstructing witnessed-causality is the whole job.

1. **Log causes, not just effects.** Every meaningful state change records _why_ (the rule that fired + what it reacted to). This builds a **causal graph** (events as nodes, "because" as edges). _This is the foundational architecture decision — make it day one._
2. **Sift the graph for story-worthy threads** (symbolic, no LLM). Salience signals: involves a _named_ character, terminates in _permanence_ (death/wound/lineage), tests an _edict_, contains a _reversal_, has _unusual length_, _closes an earlier thread_. Narrate only the top threads; the rest stay queryable.
3. **Narrate the thread, not the tick.** The LLM renders a _complete causal subgraph_ as prose and is _forbidden to invent causality._ The player's mental model thus matches the real mechanics (= fair and legible).
4. **Comprehension is diegetic, not a graph-walk.** The causal graph is the _engine's_ ground truth; the player never reads it directly. To learn _why_ something happened, you **ask the people** ("Gerald, why did you go past the cold light?") and assemble the truth from **fallible, biased testimony** + clues — the long-session activity is _investigation_, not querying a debug view. The graph keeps testimonies consistent and the LLM honest (no node → no claim); a cause can be **buried** if everyone who knew it dies (permanence applied to understanding). _(Revised from "why-chains on demand": same substrate, diegetic surface. See `target-saga.md` §4.)_
5. **Persistent threads** carry attention across time (open loops the sifter prioritizes), providing punctuation and anticipation — replacing the cut real-world gate as the reason "this week differs from last."
6. **Small, stable vocabulary** so causes are _nameable_ ("because he loved the deep water," not a tag-soup). Comprehensibility is another argument for a lean genome.

> **Tuning note:** the sifter is where this lives or dies. Target the DF-validated band — wounds, deaths, betrayals, tested loyalties rise; ambient churn stays queryable. Tune by generating thousands of ticks on a fast-forward harness and reading the output.

---

## 7. Interface: conversation plus diegetic state

- **Played through chat.** The verb-set is _speech acts_: edicts are declarations, divination is asking, the chronicle is prose, dispatch is instruction. Chat is the _native_ form of this game, not a compromise with "no graphics."
- **Reference state** (roster, map, inventory, genealogy) is rendered as **structured text** — still within "no graphics."
- Crucially, reference state is produced as **in-world reports** by seekers in roles (**quartermaster** → roster/inventory, **cartographer** → map, **chronicler** → the saga itself, **loremaster** → library). Reports vary by **completeness, accuracy, freshness, and bias** of who fills the role.
- If a role is **unfilled** (dead, quit), the surface **degrades or vanishes** — you fall back to _asking around_ (conversations with specific named seekers, each knowing only their corner). Your knowledge of your own compact is **mediated and fragile.**
- This makes roles a second axis of value (seekers are your _sensory organs_), makes succession protect _perception_, and turns information loss into the anti-idler permanence principle applied to knowledge.

### Three lenses on an event, and the adventure log

- Any resolved event can be viewed three ways: the **chronicle** (_what_ happened, as story — primary, in-fiction, kept clean of numbers), **conversation** (_why_, as fallible testimony — point 4 above), and the **adventure log** (_how it resolved_ — the checks, rolls, and modifiers).
- **Clean chronicle + opt-in raw log** (decided): the chronicle never shows numbers; a separate log view, pulled up on demand, shows real DCs / rolls / named modifiers. Two clean surfaces — soul and trust kept apart, each whole. The log is a _view_ of the resolver's record, so the resolver must log every check.
- **Principle — "expose the dice, hide the genome."** The log shows the few legible stats, the checks, the rolls, and **your edict as a numeric modifier** (e.g. _protect the named_ = **+4** on a seeker's "heed" check) — so agency is legible and fairness is provable. The dense tag-substrate and a value's _provenance_ (why his deep-affinity is so heavy) stay opaque — preserving mystery and the comprehension game. (Reconciles §2's "3–4 legible stats" with §4's hidden genome.)
- **The log answers the agency problem.** The sifter surfaces _exceptions_ (defiance is story-worthy; obedience isn't), so the chronicle structurally **understates** the player's agency — every narrated beat is a law _broken_. The log is the corrective: it shows the quiet quests where the law _held_, which the chronicle never tells. "That was you" lives in the log.

### Guardrails for mediated state

- A **baseline of self-knowledge is always free** (you always know your named cast). What degrades is the _aggregate/precise_ view and the _peripheral_ knowledge. Haze at the fringes is mysterious; haze at the core is maddening.
- Degradation must be **legible as degradation** (hedged language, visible gaps) so "I need a better cartographer" becomes a _goal_, not undetectable randomness.
- Filling a role is the **achievable default**; losing one is a _charged event_, not the baseline condition.

### Input-trust seam (open lean)

- Likely: **trust at the input layer, mystery at the outcome layer** — the game confirms it understood your _intent_ (so defiance is honest world-behavior, not parser error), and you stay unsure only about _what will come of it._

---

## 8. The patron (you)

- A **Hollow Crown**: summoned by the compact's **structural need to be whole** (a compact without a patron is _unwhole_; the vacancy itself is the need). You are **vital but not fully in command.**
- The need is **felt, not briefed** — you arrive and feel the compact _settle_ around your regard. Most of the compact takes you for granted; only an inner few hold the unsettling truth that they _called_ you; _you_ know least of all at the start.
- **What you are is buried lore the curious uncover — never a question the game asks you directly.** (Critical correction: a player operating a role won't engage with "what am I?"; redirect all existential threads _outward_ — "what is this compact for?", "what happened to my predecessor?" — and the answer to "what am I" accretes as a byproduct.)
- Likely a **once-human mind**, now bodiless or body-anchored-elsewhere, persisting only intermittently. **Absence = the regard sinking back / the body going dormant; presence = the patron gathering itself to attend again.** (Body corporeality and its meaning — devotion / dread / mystery — remains open.)
- Conversation is genuinely **bidirectional**: seekers know things you structurally can't (ground truth), you know things they can't (the view from the regard), and neither of you knows what you are.

### The wheel of patrons

- Your tenure **ends**, and your ending becomes the next patron's inheritance. The "end" should be _experienced_, not merely "when they quit."
- **The fate is play-driven, not charter-locked** (resolving Open Q#1's shape). **Completion** — you drive the charter to its end-state — is _rare_: charter horizons are long enough to be effectively unreachable in most reigns, but a lucky or cunning patron manages it (a triumphant, achievement-flavored finale). The **default ending is a fade**, and _which_ fade turns on the patron's **devotion**.
- **Devotion is (leaning) the presence/absence pillar itself** — no new stat. An obsessively-present, interventionist patron burns the regard out → **sacrifice** (the role consumed you). A mostly-absent, hands-off patron lets the compact learn to run without them, drift, and call another → **obsolescence / forgotten**. _Your pattern of attending across the whole reign writes your ending._ (This is the mechanic behind §8's quitting-vs-concluding, and behind the "forgotten" fate.) _Open: lock presence/absence as the devotion meter, or design a dedicated mechanic._
- **Hybrid ending:** the end becomes _available_ through play (fated — the need will resolve) and you _choose to meet it_ (authored — you decide the final moment). Sensed through _signs_, never a countdown.
- **Two kinds of stopping:** _quitting_ = the patron's regard simply turns away (the compact drifts, waits, eventually calls another — the "forgotten" fate); _concluding_ = meeting the offered end deliberately (a sealed, authored finale). Presence at the ending is the difference.

---

## 9. The persistent multi-compact world

- Many compacts with **analogous structure** share **one persistent world that runs at low resolution always**, regardless of who's playing.
- Goals are **orthogonal** (each founded for a different purpose via the grammar), so compacts **entangle by side-effect** — spillover consequences, shared territory, migrating/exiled seekers — rather than compete. **Closer-than-distant, but not fully entangled.**
- Other compacts are **simulated by default**, with architecture allowing them to be (intermittently) **human-run** — _felt, never met._ Federation without real-time multiplayer (patrons are almost never co-present anyway).
- When you leave, **your compact returns to the world as a neighbor for others** — it persists, possibly tended later by another patron (sim or human).
- Inter-compact events arrive as **anomalies** (eerie omen-texture sourced from other patrons instead of weather). Migrating seekers give the `foreign` provenance tag a real source and let lineages cross-pollinate between compacts.

---

## 10. Worldgen: author the grammar, generate the instance

- **No static starting place.** A wide **founding-grammar** (themed palette of purposes/objects/fates + coherence constraints) generates a fresh, themed origin every game. _You author the loom; the cloth is different every time._ Theme lives in the _constraints_, not in fixed content.
- **The founding is the only axiomatic layer** — declared (from a hand-authored pool), not simulated. This is where the regress legitimately stops.
- **The charter (founding purpose) carries an _arc-shape_:** **terminal** (an achievable end-state — "wake the drowned god") or **perennial** (open-ended — "hold the mountains against the orcs, perhaps forever"). The grammar must produce both, and skew the palette toward grand, externally-directed striving (the fantasy-epic genre constraint from Open Q#2). The charter demands a _mix of domains_ (exploration / combat / magic / art / diplomacy), giving it a tag-profile on the Domain axis that the compact resonates toward.
- **Completion is distant and emergent, never a countdown.** The charter mainly _colors the texture_ of daily striving. A terminal charter's end-state surfaces as a rare "do the final thing" quest — a small fractional chance rolled each time an _epic quest_ completes — so completion timing is unpredictable and ungrindable (consistent with §8's "sensed through signs"). On completion the patron fades (see §8); the compact persists and adopts a successor purpose.
- **Simulate texture, author meaning:** lineages/schisms/seekers can be short-simulated (emergence shines); founding purpose and predecessor fates are authored-from-templates (emergence can't produce _theme_).

### Why not "simulate from Adam & Eve"

A deep forward-sim fails on: **(1) calibration** — the sim is tuned for the small steady-state; 5000 years runs _through_ the interesting transient into a dead attractor (homogenize or explode); **(2) no authorial control** of the starting position; **(3) hidden costs** (an enormous causal graph + an unflavorable history); **(4) the cold-start paradox** (no patron existed in the past, so the backstory was a _different game_); **(5) lost theme** (emergence produces arbitrary, not foreshadowable, mysteries). Run the sim only a _few generations_ (the interesting transient) and author the meaning on top.

### The starting-position renderer

`render_starting_compact(persistent_record) → playable_compact_satisfying_contract`

- **Input** (variable richness): `{founding, [eras], [dormancy_gaps], surviving_detail, entanglements}`. Ranges from "brand-new founded, no detail" to "ancient, many eras, recently active, full detail." _Age = founding distance + eras + dormancy; lineage depth = eras deep._
- **Output contract** (fixed, invariant across input): graspable cast (5–9 named), **≥1 live tension**, legible inheritance (comprehensible predecessor + standing edicts, some with "lost" reasons), **≥1 open thread**, comprehensible current condition, **honored entanglements.**
- **Renderer:** load what persists → identify contract gaps → fill gaps by founding-pegged constrained generation → apply dormancy-decay for age-texture → short-sim to settle → render entry-state. Rich input → mostly _select & surface_; sparse input → mostly _generate_. Generated history **commits as canonical at render-time.**
- **Backward-generation survives but is bounded** by _committed-history pegs_ (the thin facts neighbors already observed). Dormant compacts commit little, so pegs stay thin; recently-active compacts are _inherited as real detail_ instead.
- **Committed history = the compression** that lets a dormant compact be discarded and regenerated consistently later. **Compact age/depth = a matchmaking lever** (young/legible for new players; ancient/layered for veterans).

---

## 11. Real-world integration (downgraded, not cut)

- Originally a core pillar ("reality gates the game"). **Downgraded to optional flavor** after concluding it wasn't the emotional heart.
- Surviving form: reality may **emit tags into the genome** (a real storm tints the world `aquatic/turbulent`, the new moon emits `dark/hidden`) — coloring the sim's mood, _not gating content._
- **The 12x clock** is the surviving "reality as pacing" element: a generation lands every few real weeks, so players experience full lineage turnover within a season while still feeling real time pass.
- Selection rule retained for any future signals: a signal should be **legible** (player can perceive the real condition), **anticipatable** (creates appointment, not just reaction), and **rare** (frequency matched to event-weight).

---

## Open questions (pinned)

1. ~~**The fate of the patron.**~~ **[PARTLY RESOLVED]** Fate is **play-driven**, not charter-locked. **Completion** (drive the charter home — triumphant) is _rare_ (long horizons). The **default is a fade**, split by **devotion**: obsessive presence → **sacrifice**; habitual absence → **obsolescence / forgotten**. Leaning to use the existing **presence/absence pillar as the devotion meter** (see §8, _The wheel of patrons_). _Still open:_ lock presence/absence as that meter vs. design a dedicated mechanic; and how the three fates' _signs_ manifest distinctly in play.
2. ~~**The primary engagement spine.**~~ **[RESOLVED]** The apex is **the story** — a fantasy tale the player lives and retells. It is produced, in order of precedence, by: **striving** toward a founding purpose (the engine — sets the genre to fantasy epic; outranks the cast because a goalless cast does mundane, un-story-worthy things), **the cast** (the heart — specific mortal people whose loss is the emotional weight; permanent death is the one non-negotiable), and **comprehension** (the verb — turns events into a tale you own; removable, hence not the spine). _Flourishing_ and _expansion_ are not separate spines but the two directions striving points (inward health vs. outward reach). The promise shifts: enter for **wonder**, stay for **the tale**. **Implication:** the founding-grammar must skew its purpose-palette toward grand, externally-directed striving, and the sifter must privilege the epic register. _(The original framing of comprehension as "the deep progression / the point" is hereby demoted; §1 updated.)_
3. **The genome's shape.** How many axes, fixed vs. floating? Lean: axes few and fixed, tags floating and LLM-maintained. Split between _world-content_ tags and _seeker-temperament_ tags, or unified?
4. **Age manifestation.** Old compacts render as **accumulation** (deep, dense, grand) or **erosion** (lost knowledge, forgotten reasons, haunted, diminished)? Eerie lean suggests erosion-forward.
5. **The patron's body.** Corporeal-elsewhere, formerly-corporeal, or never-corporeal? And the compact's relationship to it: **devotion** (sacred center), **dread** (vulnerability), or **mystery** (location unknown, even to you)?
6. **Compact commitment level.** How heavily do compacts mark each other? Lean: low-to-moderate (enough seams to feel shared, few enough that consistency stays cheap).
7. **Persistence activity.** Does the low-res world **wait** between players or **live** (foundings/endings/entanglements happening autonomously)?
8. **The starting input-trust seam.** Explicit confirmation of edicts (trust, tool-like) vs. silent absorption (eerie, uncertain)?

---

## Reading list (derisking the components)

The full combination is novel, but each component has a mature literature:

- **Elan Ruskin, "Rule Databases for Contextual Dialog and Game Logic"** (GDC 2012) — closest existing thing to the edict engine. _Read first._ (Slides public; GDC Vault video; open-source reimpl "DialogueLib".)
- **Brian Bucklew, "Data-Driven Engines of Qud"** (Roguelike Celebration 2015) — the tag/entity architecture, validated and shipped.
- **Grinblat & Bucklew, "Subverting Historical Cause & Effect: Generation of Mythic Biographies in Caves of Qud"** (FDG 2017) — tags-generate-character-history, solved.
- **Tarn Adams, "Emergent Narrative in Dwarf Fortress"** (in _Procedural Storytelling in Game Design_, ed. Short & Adams, CRC Press 2019) — emergent character, memory, why permanence drives player stories.
- **Max Kreminski** — _parametrized storylets_ (GDC 2019) and _story-sifting_ ("Felt") — the formal versions of the quest/encounter and chronicle-selection problems.
- **Emily Short / Richard Evans — Versu, "Exclusion Logic"** — rigorous tag/property-based social simulation. (emshort.blog on storylets / salience-based narrative.)

Suggested order: Ruskin → Bucklew → Adams → Kreminski.

---

## Naming

- Working title **Farwatch** has prior use in-category (a "Farwatch: Mystery" mobile game on Google Play, an itch.io horror beta, a streamer handle, a WoW place-name). Fine as a placeholder; **not safe as a shipping title.**
- Less-occupied alternatives to check: **Wardlight**, **The Long Regard**, **The Tended Dark**.
- The sworn group is the **Compact** — chosen to replace a name tied to Ars Magica, which has been retired (see [glossary-retired.md](glossary-retired.md)).

---

## Build sequencing (early guidance)

1. **The tick-loop + persistence** — time passes when no one is looking; world changes only on the tick.
2. **The symbolic substrate** with **causal-graph logging from day one** — small, testable, runnable thousands of ticks per second on a fast-forward harness.
3. **The story-sifter**, tuned against a _hand-authored fake event-log first_ (author the saga you wish the game produced, then build the sifter that surfaces it, then the sim that generates it).
4. **One sense + the chronicle** (LLM narrates real causal threads only).
5. Then: dispositions/edicts → agents as real sub-sims → the renderer/worldgen → the persistent multi-compact layer (heaviest; bank every cheap lesson first).

> The unfamiliar 20% is **tuning, not architecture**: drift-per-tick, anomaly seed-vs-resolve ratio, interpretation-fidelity, sifter salience. These yield only to running the thing and adjusting by taste.
