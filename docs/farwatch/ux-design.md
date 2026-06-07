# Farwatch — UX design

**First draft, in progress.** The player-facing **surfaces** of Farwatch — what each is, what it must
convey, what the player does — scoped for now to **the cold open through the start of turn 1** (meeting the
compact you've inherited and sending its first expedition). This is the *what and why*; how the surfaces are
**realized** on screen (navigation, the pane system, the grammars, look & feel) lives in
**[ui-design.md](ui-design.md)**. Leans on the vocabulary in [glossary.md](glossary.md); terms still
settling on a name are marked **(working name)**. The game itself is in
[game-design.md](game-design.md) / [game-design-deep.md](game-design-deep.md).

Audience: product/design — and, for the realization, [ui-design.md](ui-design.md). The player app is a
*separate* surface from the dev `inspector` (which exposes seeds, prompts, and the resolver's guts; the
player never sees any of it).

Not in scope yet: the recurring turn loop past dispatch, the saga/history archive, settings, exact
copy, motion timings, accessibility.

> **Split into UX + UI.** This doc was originally a single `ui-design.md` mixing requirements with
> realization. The genuine UI — **the frame / navigation, the pane system, the surface grammars, and look &
> feel** — has moved to **[ui-design.md](ui-design.md)**. What remains here is the surfaces and the
> experience principles. **Still straddling the line** (their realization belongs in ui-design and will be
> pulled over lazily, as each grammar is mocked): the per-surface *Missives · Board · Roster · Dispatch*
> sections, the rendering half of *Truth, and your picture of it* and *The steward*, and the *Component &
> interaction inventory*.

---

## Mental model

**Reading-first, from the desk.** The player is an absent **patron**: you attend from a **desk** — *read
what arrives*, *write what you send* — nothing else. The desk is **not a place in the compact's world**;
it is the form your consciousness gives to attending ([metaphysics.md](metaphysics.md)). So when this doc
calls the frame **diegetic**, it means *true to the patron's perception* — not a physical room (no desk
stands in the world; the steward never sits across it) — never "a themed dashboard" either. The
interaction is asymmetric — much reading, sparse and weighty authoring — and everything is reached from
one central frame, not a SaaS nav rail. Your one conduit to the world is the **steward** — your voice on
the ground, who delivers what you read and carries out what you send (see
[The steward](#the-steward--your-voice-on-the-ground)).

You attend only in spells. A turn is one **waking**: you **Awake** to what came to pass, read and decide,
**Seal** your orders — which sends you **Asleep** — and the world returns you at the next juncture that
needs you. This cycle (and the interface work it implies: waking-in, the fade on sealing, the time-jump)
is set out in [metaphysics.md](metaphysics.md); the UI here lives inside one waking.

The loop the cold open feeds into (one turn): **read** the missives → consult the roster via **counsel**
→ **dispatch** an expedition (which prospect, who goes, and — from **MVP** — a **per-trip limit** on how
far they press; standing **edicts** are a separate, later system) → time passes → read what came of it.

---

## Surfaces

The "things" the interface gives access to. Each maps to a glossary concept; **(working name)** marks
a surface term not yet in the glossary.

**The Desk (working name)** — not a surface of its own but the **frame** the whole waking happens within:
the patron's perception, through which the *day's surfaces* are read and the *standing facts* are
**summoned** (never parked — see [The frame](ui-design.md#the-frame--attention-not-navigation)).

*Standing facts* (summoned, not parked — reached through the prose or the steward's one door):

- **The Charter** — the compact's apex purpose, inherited. The thing every expedition ultimately
  serves; your "why." Rendered as a **thematic banner plus a checklist**: items that *definitely*
  advanced or set back the charter, and 0-to-a-few concrete, known must-dos.
- **The Ledger (working name)** — the compact's holdings: wealth and other persistent **resources**,
  and debts.
- **The Season (working name)** — date, season, and the clock that bites (e.g., the lien falling due
  at first snow). Time-pressure made visible.
- **Standing — deferred.** Renown and how others regard the compact. Left out until **Bonds** land;
  revisit then (it may live with Bonds rather than as its own standing fact).

*The day's surfaces* (what you do):

- **Missives (working name)** — incoming correspondence to read: the **chronicle** of the last
  expedition, tidings, a seeker's word. In the cold open, the founding news.
- **The Board (working name)** — the slate of expeditions on offer to choose among. Each is a
  **Prospect (working name)**: a candidate **expedition** before it is dispatched.
- **The Roster (working name)** — the compact's people: each **seeker**'s name, appearance, and a
  **dossier** (background and known skills/possessions) — the compact's own record, *presented* by the
  steward, not authored by them — and whether they are alive to send; some must stay to tend home.
- **Counsel (working name)** — consult a seeker's **testimony**, **relayed by the
  [steward](#the-steward--your-voice-on-the-ground)** (a *direct* seeker-chat is the very thing the
  steward's role walls off) — fallible and in-voice. Two uses: *before* a dispatch, a **read on a
  prospect**; *after* one returns, the **post-hoc why** ("why did he press on?") — comprehension as a
  verb, not only pre-decision assessment. *(Alpha-0: no live surface — the read arrives as a Seeker's-word
  missive; the post-hoc why lands at **MVP**; see [The Board](#the-board--choosing-among-prospects) and
  [Milestones](#milestones).)*
- **The Dispatch** — the committing act that ends the turn: choose the prospect and the party (some must
  stay), then seal and send. From **MVP**, a **per-trip limit** (how far they press — *"to the cold light,
  no farther"*) is the one thing you author beyond prospect-and-party. Standing **edicts** are a *separate*
  system — shown as a pre-seal reminder but *inert in Alpha-0* — see
  [The Dispatch](#the-dispatch--the-committing-act) and
  [Edicts](#edicts--standing-postures-introduced-gradually).

*The one-time on-ramp:*

- **The Founding (working name)** — the cold open, which is **the patron's first
  [Awaken](metaphysics.md)** run with first-time content: you are Called, meet your people, inherit the
  Charter and the crisis-clock, and make a first Dispatch. Not a bespoke surface — it parameterizes the
  recurring waking (see [The Founding](#the-founding--the-first-awaken)).

---

## The frame, the pane system & realization → ui-design.md

Navigation-as-attention, the corridor that dissolves into freedom, fact-summoning (the prose-index and the
steward's one door), the **pane system** (bounded co-present panes, composed per task), the **surface
grammars** (Document · Collection · Composer; deferred Dialogue · Controls), and **look & feel** now live in
**[ui-design.md](ui-design.md)** — the realization half this doc used to carry. What stays here is the
surfaces and the experience principles they must satisfy.

---

## Truth, and your picture of it

The frame everything else descends from. There are two layers:

- **The world (sim truth)** — what actually is: the expedition resolved, the seeker is dead, the coffer
  holds what it holds. **Authoritative and self-updating** the moment a turn resolves.
- **Your picture** — what you *believe*, assembled from reports that are **late, biased, and sometimes
  wrong.** It is all the patron ever touches.

The patron governs *the picture*; the world is elsewhere, and you find the gaps the hard way. This one
idea unifies counsel-fallibility, ledger-fog, and news-lag.

**Reading reconciles; it never gates state.** State is never conditional on having read about it — that
would make prose load-bearing for correctness and fight the conceit. The world resolves on its own; the
chronicle is the *explanation*, never the trigger. Skip it and the Roster is already changed, the Ledger
already moved — you simply don't know *why* until you read.

**Acting on a stale picture fails at the attempt, with news.** Dispatch a seeker your books still call
"fit" and word returns: _she was already in the ground._ Spend coin the tally promised: _the coffer was
lighter than his book._ Not a bug to prevent — the mechanism, and the same one as the chronicle: failure
-with-news is how the picture catches up to the world.

**Fog is real, uneven, and rendered — never a HUD.** A status bar reads as machine-truth by its form and
can't be made to feel fallible. So **standing facts are authored artifacts, not readouts**: the Ledger is
a *ledger* (a hand, ruled lines, ink), the Season an *almanac* open to today, the Charter a *sealed
writ*. A book can be wrong; a status bar can't. The form buys credibility:

- **Authored hand** — handwriting / a keeper's mark carries provenance; you read *the quartermaster's*
  book, not "the system's coin."
- **Room to hedge** — margins, crossings-out, "approx.," a later correction in fresher ink. A document
  can show it was revised.
- **Visible staleness** — "as of the last dispatch" at the head of the page; ink fades. Freshness is
  physical.
- **Derived, not absolute** — the total sits among line items, a figure someone summed (and could
  mis-sum), not a number the machine simply knows.

Two consequences:

- **Reliability-of-form telegraphs reliability-of-fact**, and it is *learnable, per fact*. The Charter
  (yours) is a clean, firm document; the quartermaster's ledger is messier, hedged, in a dubious hand.
  You learn to distrust the scruffy book as you learn to distrust a seeker's catastrophizing — the look
  is the tell. Fog is **uneven**: the Charter and Season are yours (firm); coin is the quartermaster's
  count (skimmable); the Roster's liveness lags by the speed of news.
- **Chrome-feedback is a written act.** A loss is a **new line in fresh ink** ("−120, the barrow"); a
  death a **struck name**; valence is ink color; and the ledger's **running entries** *are* the why — the
  record and the feedback are one object. (This supersedes any "status value ticking" notion.)

**The cold-open dial.** Every fact is a report-with-provenance in the architecture from day one (so we
never paint ourselves into "chrome == truth"), but the *amount* of fog **starts near zero** — the
player's first Dispatch must not fail on hidden bad data. The founding *seeds* the unreliable
quartermaster as characterization (a line, a raised eyebrow); the fog is **turned up later**, as the
comprehension loop teaches that the picture is fallible.

The exact rendering — true handwriting vs. merely *soft, authored* type, and where the always-to-hand
facts sit (footing, margin, a cluster of desk documents) — is a look-and-feel call for the visual pass.
The structural commitment is fixed: **facts are reports-with-a-keeper, never HUD.**

---

## The steward — your voice on the ground

The patron is absent; the **steward (working name)** is the standing **office** on the ground that bridges
the distance — your eyes, hands, and voice at the compact. **Everything reaches you through them:** they
deliver what you read and carry out what you send. The steward is the distance made into a person, so
the conceit gains a body rather than an abstraction. (Per [metaphysics](metaphysics.md) the steward
stands in the compact's world, *not* at your desk; their present-tense **address** is itself part of the
in-crossing — relayed word your regard perceives as presence.)

**A role, not a person.** The steward is an **office**, not one mortal — an empty seat the compact keeps
filled because a patron must be *perceived* to be heeded ([metaphysics](metaphysics.md): perhaps only the
steward perceives the patron). The current holder can die like anyone; the *office* does not — another is
consecrated to it, takes up the rites, and the channel persists across your many wakings and even across
**tenures**. So permadeath stays real (you can lose the holder) without the interface ever losing its one
channel (you do not lose the office). A holder's death is a **charged event** — the relay goes momentarily
dark until a successor is raised — not a silent reroll, and not a game-ender.

**A trustworthy channel, not a source of truth.** This is how the steward squares with
[the fog](#truth-and-your-picture-of-it): they are *dispassionate* (they neither inflate nor
catastrophize) and *honest about what they don't know* — "Garrick swears it's a lord's ransom; I cannot
vouch for it. The quartermaster's count says two hundred, for what that's worth." A reliable relayer of
unreliable information: the one voice that will not *spin* you, even as everything it carries may still
be wrong. Every underlying source (the quartermaster's books, a seeker's read, a drover's rumor) stays
as foggy as before — the steward just refuses to dress fog as fact. (The steward is **not** the
quartermaster, who keeps the skimmable books; the steward *presents* those books with honest hedging.)

**The dispassion is the discipline of the office.** Sworn to be an empty vessel, the steward carries
others' words *uncolored* — never makes them their own. So what reaches you is always **named** — the
quartermaster's count, Garrick's boast, a drover's rumor — and the steward is only its bearer; nothing is
ever "the steward's own view." This is what keeps a single channel from collapsing into a single *source*:
the office relays many voices, and wears none of them.

**The voices it relays are themselves mortal.** A single persistent *channel* is not a single *source* —
and the sources can die: a keeper's death can degrade or darken the surface they held (the only chart
goes blank; "I've no one to read the old shelves now, my lord"), which is how lost knowledge *generates
goals*. That permanence-of-knowledge model lives in [game-design-deep §7](game-design-deep.md); it is **out of
scope for the cold open**, where every holder is still alive — flagged here only so the single channel is
not mistaken for an indestructible one.

**Off-topic-immune by role.** When the steward speaks for others, they **relay** — they do not chat.
Asked about anything outside their office, the deflection is structural and in-character ("that is not
for me to say"). This is what makes a future counsel engine tractable: the persona's own nature is the
wall against off-topic interrogation we could not find when imagining a direct chat with a seeker.

**The voice that introduces systems.** The steward is also how new levers reach the player — not dumped
at the overwhelming start, but handed over when they're ready ("the old patron's word was always to
bring them home; do you hold to it, or shall we change? — and there are other things you may set…").
Progressive disclosure with a face. The [Edicts](#edicts--standing-postures-introduced-gradually) system
is the first thing it unlocks.

Staged:

- **Alpha-0** — the in-world keeper of the [Roster](#the-roster--the-people-you-can-lose) (author of the
  dossiers) and deliverer of [missives](#missives--the-reading-surface); a framing voice, no engine.
- **MVP** — the persona the **counsel** engine speaks through, relaying seekers' reads in-voice and
  off-topic-immune.

Name is a working term only (the archetype is the seneschal who runs an absent lord's estate).

---

## Missives — the reading surface

The heart of "reading-first": incoming correspondence, read one at a time. Built so that *reading* is an
act, not a dump.

### The stack

The incoming pile, **oldest-unread-first** so events are read in sequence, and a **re-readable archive**
(the seed of the Saga) — first read is paced, re-read is whole. Each entry shows **sender · type ·
subject / first line · read-state**. Type is also signaled by **physical dressing** (a wax-sealed
chronicle vs. a hasty scrawled tiding), so the pile is legible before a word is read.

The **"when"** (date) is left as **register-placeholder text** ("at the turn of the season") until time
and pacing are settled — concrete dates wait on the clock design.

Types: **Chronicle** (the telling of the last expedition), **Tidings** (news from the world),
**Seeker's word** (an unsolicited note — distinct from *Counsel*, which is summoned). The cold open
adds **Founding news** (the warden's death, the inheritance).

### A single missive

- **Preamble** — from whom, from where, the register-placeholder "when," in their hand.
- **Body** — pure prose, **no mechanics woven in.** A paragraph (tiding) to the full telling (chronicle).
- **Enclosure(s)** — the *forward-looking* consequence, **attached to the letter, never narrated within
  it** (see below). Absent on a missive that only reports.
- **Sign-off** — the hand it's signed in.

### Two registers of consequence

A missive changes things in one of two ways, treated oppositely:

- **Backward-looking — the reckoning.** What already happened (resources spent/won, a seeker wounded or
  lost). Past tense, already applied. Told **in the prose**, in-voice ("the strongbox came home lighter
  by half; Odric did not come home at all"), with the **chrome quietly reacting** (below). Never system
  text — it is the emotional payload.
- **Forward-looking — an offer or obligation.** What is now possible or required. Rendered as a
  **diegetic enclosure**: the letter physically encloses a thing (a slip for the Board, a sealed writ),
  sitting *beside* the prose, handled as an object. This sidesteps both a toast (too app-like) and a
  system-font gloss (too jarring) — the enclosure is in-world, so it carries no register clash.

**Consequences chain.** A backward event can mint a forward offer: a seeker's death (reckoning,
portrait greyed) can spawn a **funeral-rites** Prospect — likely as its own later missive, so grief
lands before the choice to honor. Prospects therefore rise **from within** the compact (its dead, its
needs), not only from outside rumor.

### Enclosures — offers and obligations

- **Offers** — `take` / `discard`. May touch *any* fact, and **taking can itself tick a fact** (an
  upfront price to agree to a quest ticks the Ledger as the slip is taken). Non-quest kinds: a loan
  (coin now, a lien later), a tribute, a roster change (a seeker offers to join or asks leave), a
  charter development.
- **Obligations / impositions** — `acknowledge` / face it, **no decline**: a debt come due, an edict
  from above, the founding crisis. Same enclosure motif, different verb — the UI must not offer
  "discard" on something that can't be refused.
- **Discard is final** — decided is decided; the missive stays re-readable but its enclosure shows the
  resolved state ("declined"). Declining a *plea* carries a **shadow** (a village remembers, a Bond
  frays) — *deferred until Bonds/Standing land*, but it is why "decline" is a real choice.
- **Two layers of "no"** — refuse at the door (discard the slip → never a Prospect) vs. take it onto the
  Board and never dispatch it (later it may expire with the clock — *expiry deferred to time design*).

### The chronicle's paced reveal

The chronicle is authored beat-by-beat (each trial a passage), so it **arrives** that way:

> **Preamble (the charge)** — what you sent them to do → **Beats** — each trial's passage, revealed one
> at a time → **Reckoning (the tally + fates)** — what was won, what it cost, **who came back changed.**

Beats are advanced by a **page-turn gesture** (a drag/turn, not a button press) — you sit with each
success-or-reversal before the next, so the *therefore / but* grammar lands. **Permadeath and wounds are
reported in the reckoning**, after you've earned them. On re-read it **collapses to continuous prose.**

### Chrome-feedback — how a changed fact shows it changed

The reusable language is the **written act** from [Truth, and your picture of it](#truth-and-your-picture-of-it):
a loss is a **new line in fresh ink**, a death a **struck name**, valence is ink color, and the keeper's
**running entries** *are* the why. Used by the reckoning, by costed offers, and by incidental changes (a
tribute) alike — the record and the feedback are one object, so no toast is needed.

It is **anchored to its cause**: the entry appears *as* the reckoning line is read, or *as* the slip is
taken — never free-floating.

**Known tension:** wherever the always-to-hand facts sit, the reckoning is read elsewhere on the page —
an entry appearing in the Ledger may go unseen at the moment it matters most. The **reckoning page gets
special handling** (the page-turn to it pairs with the fact reacting, or it momentarily lifts the
affected facts up beside the prose). Flagged for the visual pass, not solved here.

---

## The Board — choosing among Prospects

Where the truth model becomes a wager. The slate of **Prospects** to weigh and commit, populated by
Missive-triage (taken enclosures) and the founding's seed. You commit **one expedition per turn**; the
others wait (and may later expire). A Prospect can also be swept off the board — the door-side "no" of
the [two layers](#enclosures--offers-and-obligations).

### A Prospect — anatomy

Each field is a **claim with a source**, never a spec:

- **The charge** — what's asked (recover the relic, clear the barrow, escort the caravan). The firmest
  part: a request is real even if its premises aren't.
- **The source & provenance** — *who* brought it and how much they're worth: a drover's rumor vs. a
  noble's sealed writ vs. the compact's own need.
- **The promised prize** — a **claim**, and foggy: "said to be a lord's ransom." It can be inflated, or
  a **phantom** (`viable: false` — the relic was never there; the slip can't betray it, and the party
  can't know until they stand in the empty vault).
- **The reckoned hazard** — the danger and the *kind* of trouble ("locked ways, old wards"), hinting at
  the approaches it favors. An estimate, not a stat block.
- **The terms** — upfront cost (ticks the Ledger *on dispatch*), party size, duration, any clock.

### Fog, rendered — no numbers to start

Same principle as the standing facts: a Prospect is a **slip in someone's hand**, its claims **hedged in
language** ("they swear," "said to be"), its confidence carried by *whose hand* and *how it's worded* —
**no percentages, no expected value**, which would collapse the conceit. Because every prize and hazard
is a claim, there is **no honest ranking**: the Board lays the slips **side by side for qualitative
weighing**, never sorts them. Choosing is judgment under uncertainty — that *is* the gameplay.

*Likely-later:* a coarse **tag** layer ("perilous / fair / unknown") is the probable first concession
when players want more legibility — designed-for, not built in Alpha-0.

### Assessment — via seeker missives (Alpha-0)

The Board *states* a claim; it does not evaluate. An expert read comes from a seeker — but **for Alpha-0 the
live Counsel chat is deferred**, and assessment instead **arrives as a Seeker's-word missive**: a member
sends their read of a Prospect, fallible and **temperament-biased** (Garrick inflates, Odric
catastrophizes), voiced in-character. This reuses the Missives surface, supplies personality *without*
deep characterization, and fills the assessment role: **raw claim (Board) → biased read (missive) → truth
(only the expedition reveals it).** The full summon-and-chat **Counsel** surface is Post-MVP. (How a read
is solicited — simply arriving for Prospects in play, or the player "sending for word" and a missive
returning — is minor; settle at build.)

> **Counsel staging (open).** The order is **none** (Alpha-0 — the read rides on a missive) →
> **steward-mediated** (MVP — the steward relays a seeker's read in-voice, including the post-hoc *why*) →
> **anyone** (Post-MVP — summon a seeker directly). The last step reopens a question left open elsewhere —
> whether the **steward is the only character the patron ever addresses** — so "anyone" is flagged, not
> decided.

### Commitment & the bridge

**One dispatch per turn, fixed party size** for Alpha-0. The hazard's hinted *kind* ("expect old wards")
sends you to the **Roster** to pick a party suited to it — but the hint is foggy, so **party selection is
itself a bet.** Board → (assessment missive) → Roster → Dispatch is the spine of the turn.

*Later:* flexible party size and composition, and **concurrent dispatches** limited only by roster
availability and **seeker willingness** (a seeker may decline to go).

### The cold-open dial

The founding's first Prospect is **viable and roughly honest** — the maiden dispatch must not be a
phantom-prize bust. Bluffing prizes and thicker fog turn *up* later, once the player has learned the
system can lie.

---

## The Roster — the people you can lose

The compact's roll — the ten **seekers** you inherited, presented as *people*, not a unit list. Its jobs:
let you **read each seeker**, show **who's alive to send**, and **pick the party** for the Prospect you
favor. It is the emotional anchor of the game — these are the named, characterized people you can lose,
so the surface must make them *people* before permadeath makes them stakes.

### A seeker — anatomy (what you can know)

Layered channels of fallible knowledge on one person:

- **Name & appearance** — the **permanent record** (the pre-seeded profile; a future texturizer's job).
  Relatively objective — it's your own roll.
- **The dossier (the compact's record)** — a **background** (upbringing, training, criminal history,
  social connections) written in a hand, plus an **approximate list of known skills and possessions** —
  concrete ("keeps a set of picks," "soldiered for the marches," "reads the old script") but **never
  rated**. You size a seeker up the way you would a real hire: from history, holdings, and connections.
  *Whose* record it is — a quartermaster-style keeper, the previous patron's notes — is left open; in
  **Alpha-0** it is simply *the compact's records*, **presented** by the steward, never the steward's own
  view (the steward [wears no view](#the-steward--your-voice-on-the-ground)).
- **Alive or lost** — the only state. A general fitness system (wounded/weary) is **deferred**;
  permadeath is the sole stake.

### You don't *know* what people are good at

The sim holds exact skills (−2..+2), but exposing them as numbers is HUD-truth twice over — it breaks
the conceit *and* an absent patron wouldn't plausibly know them. So **aptitude is an impression**, read
off the dossier (background + known skills/possessions), and **learnable**: the gap between your
impression and their true skill closes as you watch them in chronicles — and sometimes the record was
wrong, or someone surprises you. Three fallible channels feed the impression: the **dossier** (the
compact's record), the **assessment missive** (the seeker's own biased read), and the **chronicle**
(observed performance). None is ground truth.

That makes party selection a **double bet** — impression-of-skill matched against hinted-kind-of-hazard,
fog against fog. That wager is the gameplay the Board hands here.

### The stakes live here

Permadeath is anchored on this surface. Loss renders as the chrome-feedback
[written act](#chrome-feedback--how-a-changed-fact-shows-it-changed) — a **struck name** — and it lands
because the dossier made them a person first. Persistent + named + characterized *is* the investment hook.

### Selection (Alpha-0)

Pick a **fixed party size** to dispatch; the rest **tend home**, and the lost are ineligible. *Later:*
seeker **willingness** (they can decline) and flexible size/composition, per the Board's
concurrent-dispatch direction.

---

## The Dispatch — the committing act

The turn-ender, and the **one place the patron authors** rather than reads. It gathers the turn's threads,
takes your commitment, and sends — after which time passes and you learn the result only when the
chronicle returns. The asymmetry resolves here: much reading, then one weighty, irreversible act.

**What you commit:** in **Alpha-0**, the chosen **Prospect** and the **party** you're betting — the whole
authored act. From **MVP**, one input more: the **dispatch-limit** (below). Standing **edicts** are *not*
an input here at any stage — they live on their own surface; the Dispatch only *reminds* you of them
(see below). Elements:

- **The assembled commitment** — the Prospect (its claim, fog intact), the party (the bet), and the cost
  about to be paid, brought together to weigh one last time.
- **The dispatch-limit (from MVP)** — the one thing you *author* beyond prospect-and-party: a **per-trip
  limit** on how far the party presses — *"to the cold light, no farther."* Scoped to this single
  expedition and **exceedable** (a seeker may keep it or break it), it is *not* a standing
  [edict](#edicts--standing-postures-introduced-gradually); it is the Seal step's first configurable
  content, and the seed of the pre-seal authoring the edict system later fills out. Set as an abstract
  reach at dispatch; the chronicle **names the landmark** when it returns.
- **The edict footnote** — a pre-seal reminder of the standing postures in play ("they go under the old
  patron's word: *bring everyone home*"). In Alpha-0 it is **read-only** — a diegetic seed of a system that
  turns interactive later; it will link to the edicts document once that exists.
- **The steward's last word** — an honest hedge before you commit ("they go on what we know, my lord") —
  the [picture-vs-world gap](#truth-and-your-picture-of-it) named at the moment you bridge it on faith.
- **The seal** — the commit gesture (the wax-seal motif from the nav): sealing *is* sending, and more —
  it is the patron's one causal stroke on the world, and it sends you **Asleep** ([the waking
  cycle](metaphysics.md)). A deliberate ritual, like the page-turn — weight by design, and it triggers
  the fade that ends the waking.
- **The cost ticks** — the upfront price paid on dispatch, rendered as the Ledger
  [written-act](#chrome-feedback--how-a-changed-fact-shows-it-changed).
- **Irreversibility** — once sealed, you go under; the world advances by an amount you don't control, and
  you learn the result only when the next waking returns you to the waiting chronicle. There is no recall.

---

## Edicts — standing postures (introduced gradually)

**What an edict is:** a **standing posture** the party applies in your absence — your values projected
onto autonomous people, *never a tactic* (you are not there to direct the deed). Structured as
**orthogonal axes**, each defaulting to "their discretion" and persisting until changed. The cardinal
axis:

> **Edict vs. dispatch-limit.** An edict is *standing* — it persists across **every** dispatch until you
> change it. A [**dispatch-limit**](#the-dispatch--the-committing-act) (*"to the cold light, no farther"*)
> binds **one** expedition and is gone with it. Same conceit — an order a seeker may keep or break —
> different scope: *always* vs. *this trip*. The limit lands at **MVP**; the edict *system* is later.

- **Peril** — *"Bring everyone home"* (withdraw rather than risk a life) · their discretion · *"The charge
  above all"* (press whatever it costs).

Further axes — **Reach** (scope: beeline vs. take-all), **Purse** (spend frugally vs. spare no expense),
**Bearing** (go unseen vs. make our name known — parked on Standing) — come later; a deeper review of the
axis set waits on how they plug into the resolver's decision-making. (A "favor-an-approach" axis is
excluded — that's tactics, which the conceit forbids.)

**Why edicts are out of the cold open.** Once choosing the mission and the party became the real
decisions, edicts stopped being central — and "press it even if people die" is exactly the values-call
no one can make *uninformed*, on day 0, before they know their people. So Alpha-0 **pulls edicts out
entirely** and runs a single inherited default in the background — **Peril = bring everyone home** — with
the other axes inert.

**Gradual introduction — the steward's job.** After some time and successes, the
[steward](#the-steward--your-voice-on-the-ground) surfaces the system in-world: "the old patron's word
was always to bring them home; do you hold to it, or shall we change? — and there are other things you
may set." This is the general pattern for revealing systems: levers arrive when the player is ready, not
at the overwhelming start.

**Persistence & its surface.** Edicts persist as the compact's standing disposition — and the deep reason
is the [waking cycle](metaphysics.md): the compact self-runs while you are **Asleep**, so your standing
postures are *what governs it in your absence*, the autopilot for the gaps. Their home is a **document
listing every axis with a toggle (or like affordance) to change it** — reviewed and adjusted in one
place — and each Dispatch reaffirms them as the **pre-seal footnote** above, so what's in play is named
at the moment it bites.

**Alpha-0 status:** inert (Peril = bring-everyone-home, in the background), but **designs account for it** —
the dispatch footnote and the eventual document are shaped now so the system slots in without rework.

---

## The Founding — the first Awaken

The cold open is **not a bespoke sequence — it is the patron's first [Awaken](metaphysics.md)**, run with
first-time content and the steward close at hand. This is the rule that makes it cheap: *design the
recurring waking well, and the Founding is its first, guided instance* — the same components,
parameterized (more steward presence, fog dialed to zero, edicts inert, the inherited state freshly
minted). One path serves day 0 and every waking after.

### The recurring Awaken (the shape the Founding inherits)

1. **Wake-in** — fade from black; the patron gathers.
2. **Orientation** — the steward attends you with what came to pass while you slept (below); the waiting
   missives and updated chrome carry the detail.
3. **At the Desk** — standing facts reflect current state; the day's surfaces wait with attention cues
   (unread missives, an undispatched waking).
4. **Read** — work the missives (the returned chronicle, tidings, a seeker's assessment); take or decline
   enclosures.
5. **Decide** — weigh the Board, pick the party at the Roster.
6. **Seal → fade** — commit at the Dispatch; go Asleep.

### What must be presented proactively — orientation

The data a waking *pushes* at you, unbidden, so you can re-situate:

- **Where we are now** — elapsed time and the Season/almanac; deadlines that moved closer or fell due
  while you slept ("some time has passed," in register, not a tally you watched).
- **What changed while Asleep** — the **returned chronicle**, the facts that ticked (Ledger entries), and
  — the weight — **who was lost** (a struck name on the Roster). A death under your Sleep is surfaced
  here, not buried.
- **What needs you now** — the open decision: prospects on the Board, the absence of any expedition
  afield, the reason you were woken.
- **Delivered by** — the **steward's recap** (present-tense address) + the **waiting missives** (relayed
  detail) + the **updated chrome** (the new state, its *why* in the unread).

### What the Founding adds (first-time only)

- **No prior chronicle** — in its place, the **founding news**, from the steward: you have been
  **Called**; the previous patron has **Faded**; the compact has been held on their last standing word
  (*bring everyone home* — the inert edict, now diegetically explained).
- **Meeting your people** — the Roster dossiers are *new to you* here (a normal waking assumes you know
  them); the Founding foregrounds the introduction.
- **The standing facts, freshly set** — the Charter (your *why*), the Ledger, and the Season's
  crisis-clock established for the first time.
- **One honest Prospect** — viable and roughly honest (the cold-open dial), as the first enclosure.
- **The steward closest, the regard least focused** — your attention at its most untrained, so the
  corridor is at its most blind: you are *carried*, not steering ([the navigation
  curve](ui-design.md#the-frame--attention-not-navigation)). Most guidance here; fog at zero; edicts inert.
- It ends on the **first Seal and the first fade-to-black** — the cycle taught by performing it once.

---

## Component & interaction inventory

The minimal set that implements the Founding *and* every future waking — the bridge from these surfaces
to a build. Nothing here is Founding-only; the Founding just parameterizes it.

**In-universe components**

- **Awakening transition** — fade in/out; the cycle boundary.
- **The steward's address** — the patron's direct channel: greeting, the orientation recap, contextual
  **interruptions/prompts**, and (later) progressive disclosure of systems. *Distinct from missives* —
  the steward *attends* you in the present; missives are relayed correspondence from others.
- **The Desk** — the frame; **navigation is attention** (the procession and its page-turn; one surface
  attended, the rest receded; Dispatch set apart as the sealing act).
- **Standing facts** — the authored artifacts (almanac, ledger, charter): **summoned inline → detail,
  then recede** (never parked), with chrome-feedback rendered as written-acts.
- **Missive stack + reader** — the stack; the missive reader; the chronicle's **page-turn reveal**;
  **enclosure handling**.
- **The Board** — prospect slips, laid out for qualitative weighing.
- **The Roster** — dossiers; party selection.
- **The Dispatch** — the assembled commitment; the edict footnote; the **seal**.

**Interaction patterns**

- **Page-turn gesture** — advancing chronicle beats.
- **Enclosure handling** — take / discard / acknowledge.
- **Glance → detail** — expanding a standing fact.
- **Steward interruption/prompt** — contextual, in-voice guidance and gating (a too-small party, a
  looming deadline, unlocking edicts later).
- **Seal** — the commit gesture that triggers the fade-out.

**Out-of-universe — kept minimal**

- **No tutorial popups, no "quest unlocked" modals.** The **steward is the in-universe tutorializer**
  (progressive disclosure with a face); onboarding is in-voice, not overlay.
- **System chrome** — settings / save / quit: unavoidable, tucked away, non-diegetic.
- **Interaction affordances** — first-use cues (a page-corner shimmer, a seal that wants pressing): kept
  subtle, and **preferred diegetic** (the steward: "turn the page when you are ready") over a
  non-diegetic hint.

---

## Milestones

The build ladder, and what each phase adds. Everything below is *designed-for* from the start, so each
phase slots in without rework. The numbering is deliberately open-ended —
**Alpha-0 → Alpha-1 … Alpha-N → MVP → Post-MVP** — so refinements found by playing get their own numbered
cut *before* MVP rather than forcing a premature jump.

**Alpha-0 — the walking skeleton.** Prove the whole loop and the chronicler end-to-end on the least content
that can carry them. Scope: the cold open through the first Seal — one waking.

- The full **waking loop** — Awaken → read → decide → Seal → fade — as one path; the
  [Founding](#the-founding--the-first-awaken) parameterizes it.
- The **Desk**, and **standing facts** (Charter, Ledger, Season) as authored artifacts (summoned inline,
  written-act feedback).
- **Missives** — stack, reader, the chronicle's page-turn reveal, enclosures (take / discard /
  acknowledge).
- **The Board** — prospects as claims, weighed qualitatively, no numbers.
- **The Roster** — dossiers, party selection at **fixed size**, alive / lost.
- **The Dispatch** — assemble + seal; the edict footnote, read-only. **No dispatch-limit yet.**
- **The steward** — framing voice (recap, delivery, prompts); no engine.
- **Assessment via Seeker's-word missives**, standing in for Counsel.
- The **fog architecture** present but dialed near-zero.

**Alpha-1 — the recurring waking (rails off).** The first cut past the walking skeleton: the patron steps
off the Founding's rails into **free movement** (turn among Board ↔ Roster ↔ a standing fact at will), the
**soft-current opening** (a suggested order you may step out of) replaces the corridor, and a waking can run
**more than one dispatch**. See [the frame](ui-design.md#the-frame--attention-not-navigation).

**Alpha-2 … Alpha-N — iteration headroom.** Refinements discovered by playing land here, each its own
numbered cut. This band exists so pre-MVP polish isn't mislabelled as MVP.

**MVP — the first build worth playing** — the milestone where the [target saga](target-saga.md) first
becomes reproducible. Over the alpha, it adds:

- **The dispatch-limit** — a per-trip, exceedable reach limit (*"to the cold light, no farther"*); the Seal
  step's first authored content. See [The Dispatch](#the-dispatch--the-committing-act).
- **Defiance** — the limit (and the inherited Peril edict) can be *outweighed* and broken, traced to a
  legible cause: the agency beat the saga turns on.
- **Counsel, steward-mediated** — a seeker's read relayed in-voice through the steward, including the
  post-hoc **why** ("why did he press on?") — comprehension as a real verb, not just pre-decision
  assessment.
- **Thicker fog** — turned up from the alpha's near-zero, as the comprehension loop teaches the picture
  can lie.

**Post-MVP — designed-for, deferred:**

- **The adventure log** — the opt-in *expose-the-dice* view; held back until its reconciliation with the
  in-universe surfaces is worked out (its own problem).
- **Counsel with anyone** — direct summon-and-chat beyond the steward's relay (reopens "is the steward the
  only character you address?").
- **Interactive edicts** — the standing-posture *system* and its document; axes beyond **Peril** (Reach,
  Purse, Bearing).
- **Legibility tags** (perilous / fair / unknown) on prospects and aptitude — pure prose first.
- **Time & pacing** — concrete dates (register-placeholder for now), the clock/Season detail, prospect
  **expiry**, and long-Sleep **self-run**.
- **Fitness** beyond alive / lost (no wounded / weary).
- **Concurrent dispatches**, flexible party size/composition, and seeker **willingness**.
- **Standing** (renown) and **Bonds** — and with them the decline-a-plea shadow and the **Bearing** edict
  axis.
- **The texturizer** (seeker profiles are pre-seeded for now).
- **Phone reading (re-engagement)** — unlock the *reading* half on phones (Document degrades via inline
  fact-unfold) once a "word has arrived" loop makes the responsive work worthwhile; the width-gate then
  narrows from *the whole game* to *the deciding surfaces only*. See
  [ui-design → Responsive](ui-design.md#responsive--a-minimum-width-gated-in-world).

---

## Glossary work this implies

Surfaces to coin, and referenced world-terms to finish defining (the glossary's own to-come list):
**Patron**, **Compact**, **Seeker**, **Charter**, **Edict**, **Dispatch**, **Dispatch-limit**,
**Chronicle**, **Steward**, **Quartermaster** (world); **Desk**, **Missive**, **Board / Prospect**,
**Roster**, **Counsel**,
**Ledger**, **Season**, **Founding** (surfaces). Settle these in cycles alongside detailing each surface
below.

---

## Look & feel → ui-design.md

The parked look-and-feel brief moved to
[ui-design.md](ui-design.md#look--feel--parked-draft-to-choose-visually) with the rest of the realization.
