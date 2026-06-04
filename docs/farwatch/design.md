# Farwatch

Farwatch (working title) is a single-player game with no graphics, played through conversation. You are a patron — a called, mostly-absent presence — who inherits an existing covenant of seekers and stewards it not by direct control but by governance: you issue standing edicts and dispatch expeditions, then leave, and the world runs without you on its own clock. When you return, you read the saga of what happened in your absence — quests gone right or wrong, seekers who rose or fell, your laws faithfully kept or quietly defied by people with their own wills. The game is about coming to understand an opaque, living thing you only partly control, in a world that persists and evolves whether or not you're watching, populated by other covenants pursuing their own orthogonal ends. It's a techno-arcane game about keeping something alive across time, mostly by trusting it to keep itself.

## The engagement spine

What the player is ultimately playing for is **the story** — a fantasy tale they live through and retell, the way a group retells a years-long campaign. The story is the apex; everything else exists to produce it. Three things produce it, in order of precedence:

1. **Striving toward a founding purpose (the engine).** Each covenant is founded on a charter — unique, authored at worldgen, pitched above mere survival — that demands a mix of exploration, combat, magic, art, and/or diplomacy. The purpose is what makes the cast's actions *story-worthy*: it sets the genre to **fantasy epic**, not domestic drama, comedy, or romance. Without a grand goal the cast does mundane things and the tale falls flat — which is why striving outranks the cast.
2. **The cast (the heart).** Specific, mortal, non-fungible people whose rise and loss is the emotional weight the story lands on. Permanent death is the single non-negotiable: remove it and there is no game. The purpose gives the cast something epic to do; the cast gives the purpose someone to grieve.
3. **Comprehension (the verb).** How the player turns lived events into a tale they *understand* and can retell — the why-chains, the legible causes. It is removable (without it the game still works, just feels more random), so it is the deep *verb*, not the spine: it makes the story *yours* rather than something that merely happened to you.

**The charter has a shape, and a distant end.** Charters vary in *arc-shape*: some are **terminal** (an achievable end-state — "wake the drowned god beneath the reef"), others **perennial** (open-ended — "hold the mountains against the orcs, perhaps forever"). Either way the charter mostly *colors the flavor and texture* of daily striving rather than driving toward a near goal — the end-state, when one exists, is **distant and emergent**, surfaced as a rare "do the final thing" quest (a small chance rolled each time an *epic quest* completes), never a countdown. Completing a charter is a real but uncommon outcome; it fades the patron out while the covenant — valued by its seekers — persists and takes up a successor purpose. *(See The patron / the wheel.)*

**The promise shifts over time:** a new player enters for **wonder** — discovering the shape of their limited agency and the possibilities open to the covenant — and a veteran stays for **the tale** they have accumulated.

> *Genre is a design constraint.* Because the target is fantasy epic, the founding-grammar's palette of purposes must skew toward grand, externally-directed striving, and the saga-sifter must privilege the epic register over the domestic. *(Propagate to worldgen and the story-sifter.)*

## Key features and ideas

### The core stance: govern, don't operate

You're absent by nature, so your agency is standing intention, not real-time control: edicts, dispositions, dispatches that bias how the world plays itself out while you're gone.
Consequences arrive as narrative you provoked, never as chores you missed. Absence generates story, never loss.
The deepest *verb* is comprehension — building a working model of an opaque-but-fair system — but comprehension serves the story; it is not what the player ultimately plays for (see The engagement spine). Progression is never score or XP.

### The covenant of seekers

A small cast of named seekers (the ones you know and grieve) plus a statistical mass of anonymous members; anonymous can graduate to named by surviving or doing something remarkable.
Seekers go on expeditions that resolve as short chains of weighty stat-checks, not tactical combat — the drama is who you sent and what it cost, not blow-by-blow mechanics.

**Permanent stakes:** death is real and irreversible, and a lost seeker is a specific, non-fungible loss. This is the main thing separating it from an idler.

### Edicts as interpreted-not-executed law

You govern by standing conditional directives ("protect the named above the spoils") that seekers interpret in the field — faithfully or not, depending on their character.
Defiance is the content: a seeker breaking your edict always traces to a legible cause (this person, this trait, this pressure), so the surprise deepens character rather than feeling random.
Edicts are scarce and ranked; their collisions are dramatic; choosing what not to legislate matters.

### The tag genome (the simulation substrate)

Everything — seekers, quests, encounters, items, places, events, even reality — is described in a shared vocabulary of tags across a few orthogonal axes (theme, temperament, domain/competence, condition, etc.).
One resonance operation (compare two tag-profiles, compute a consequence) powers all interactions: who enjoys a quest, who bonds with whom, who's good at what, what an edict matches.
Tags are dense and unexposed; an LLM janitor keeps the active vocabulary small enough to stay alive. Affinity (desire) and competence (ability) are separate axes, which creates characters with inner conflict.

### Emergent character via a web of influence

Shared resonant experience → enjoyment → bonds → influence → affinity-drift. Seekers shaped by who they quest and study alongside, weighted by exposure (a web, not a clean apprenticeship tree).
This produces schools and culture — clusters of temperament traceable to founders — that you tend but don't author.
Flavor layer: mechanical tags carry concrete narrative instances ("Gerald loves the deep water" vs. "Greta is fond of sea creatures") — same math, different soul. Flavors are emergent-first, minted by events, stored once, read forever, and never feed back into the sim.

### Saga comprehensibility (the engineering spine)

The sim logs causes, not just effects — every state change records why, building a causal graph.
A symbolic story-sifter scores threads for narrative worth (named characters, permanence, tested edicts, reversals, callbacks) and surfaces only the worthy ones.
The LLM narrates real causal chains only — it can't invent causality — which keeps the player's mental model accurate. You can interrogate the graph ("why did Berthold press on?") as the long-session activity.
Persistent open threads carry attention across time and provide the punctuation/anticipation.

### The interface: conversation plus diegetic state

Played through chat: edicts are declarations, divination is asking, the chronicle is prose, dispatch is instruction. The verb-set is speech acts.
Reference state (roster, map, inventory) is rendered as in-world reports from seekers in roles (quartermaster, cartographer, chronicler) — and degrades or vanishes if those seekers are unskilled, dead, or gone. Your knowledge of your own covenant is mediated and fragile.
Three lenses on any event: the **chronicle** (what happened, as story), **conversation** (why — assembled from fallible testimony, not a why-chain dump), and an **opt-in adventure log** (how it resolved — the checks, rolls, and your edict as a modifier). The chronicle stays clean of numbers; the log is where the nuts-and-bolts live. Guiding rule: **expose the dice, hide the genome** — show the rolls and modifiers (fairness, agency) while the tag-substrate and its provenance stay opaque (mystery). The log also corrects the saga's bias toward *exceptions*: it's where you see the quiet quests your law quietly held.

### The patron (you)

A Hollow Crown: summoned by the covenant's structural need to be whole, you're vital but not fully in command — and what you are is buried lore the curious uncover, never a question the game asks you directly.
Likely a once-human mind, now bodiless or body-anchored-elsewhere, persisting only intermittently — your absence is the regard sinking back, your return is the patron gathering itself to attend again.
Your tenure ends (freed / consumed / forgotten — pinned), and your ending becomes the next patron's inheritance. The wheel of patrons turning is the literal premise.

### The persistent multi-covenant world

Many covenants with analogous structure share one persistent world that runs at low resolution always. Their goals are orthogonal, so they entangle by side-effect (spillover, shared territory, migrating seekers) rather than compete — closer-than-distant, not fully entangled.
Other covenants are simulated, but the architecture allows them to be (intermittently) human-run — felt, never met. Federation without real-time multiplayer.
When you leave, your covenant returns to the world as a neighbor for others; it persists.

### Worldgen: author the grammar, generate the instance

A wide founding-grammar (themed palette + coherence constraints) generates a fresh, themed origin every time — no static starting place.
Starting position = a renderer that materializes a playable covenant from its persistent record (founding + prior eras + dormancy gaps + surviving detail + live entanglements), always satisfying a fixed quality contract (graspable cast, ≥1 live tension, legible inheritance, ≥1 open thread).
Backward-generation survives but is bounded by committed-history pegs (the thin facts neighbors already observed); covenant age/depth becomes a difficulty-and-tone matchmaking lever.

### Real-world integration

Originally a core "reality gates the game" pillar; now diminished to optional flavor — reality can emit tags into the genome (a storm tints the world aquatic/turbulent) — rather than gating content. The 12x clock (generations land in real weeks) is the surviving "reality as pacing" element.

### Open questions pinned

~~The fate-of-the-patron fork: completion / obsolescence / sacrifice.~~ **Partly resolved** — the fate is **play-driven**, not fixed by the inherited charter. **Completion** (you drive the charter home) is *rare* — the horizon is long enough to be effectively unreachable in most reigns, but a lucky or cunning patron manages it. The **default ending is a fade**, and which fade turns on your **devotion** — leaning on the existing presence/absence pillar as the meter: an obsessively-present, interventionist patron burns out → **sacrifice**; a mostly-absent, hands-off patron lets the covenant outgrow them → **obsolescence / forgotten**. *Open: lock presence/absence as the devotion mechanic, or find another.*
~~The primary engagement spine: flourishing, the cast, comprehension, or expansion — which one the others hang off.~~ **Resolved** — see *The engagement spine*: the apex is the story, served by striving (the engine) > the cast (the heart) > comprehension (the verb); flourishing and expansion are the two directions striving points.
Age-as-accumulation vs. age-as-erosion in how old covenants render.