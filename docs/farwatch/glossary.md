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

_Referenced above, with sections of their own to come: Resolver · Adventure log · Edict · Dispatch ·
Seeker · Covenant · Charter · Causal graph · Chronicle._
