# Open questions

> Blueprint, not a specification. See `README.md` for the status labels.

These questions are not settled. Each one names the roadmap project that must answer it.

## Experience

1. **What happens in the first minute of an empty project?** The brainstorm started from a project that already has content. What does the designer say first, and what exists before that sentence? (Projects 1, 2)
2. **Where does the conversation with the agent happen?** In a panel inside the tools, in a terminal with a coding agent, or both. (Projects 2, 6)
3. **Which changes does the designer make by hand, and which by request?** A drag is agreed. Editing a field value in an inspector is proposed. (Project 6)
4. **How does the designer review the agent's assumptions?** The mockup shows a list. The owner did not confirm it. (Projects 3, 6)
5. **How are recognized names in text handled when a match is not certain?** A common word such as "gap" or "ring" can also be a name. A name can match more than one thing. The tools must also show the difference between an immediate match and a link that the agent confirmed. (Project 6)

## Model

6. **Is "all state lives in declared fields" a hard rule?** Proposed as rule R4. (Project 1)
7. **What scopes exist for a registered thing?** The brainstorm mentioned scene scope and game scope and settled neither. (Project 1)
8. **Does a rule system exist as data, on top of behaviors as code?** A system of triggers and effects can be read without running it. The proposal is that the agent adds one when a game has enough behaviors of that shape. (Project 3)
9. **How is a change in a paused game written back to authored state?** What happens when the live change conflicts with a file? (Project 2)
10. **Which relations between entities are in every game?** A room contains entities, and an entity can be attached to another. Which relations exist in every game, and which a game adds, is not settled. (Project 1)
11. **What kinds of reference exist, and what are they called?** The cases are a reference to a different component of the same entity, to a different entity, and to a component of a different entity, in the same subsystem or in different subsystems. It is also not settled if names need a namespace for each subsystem. See "References" in `concepts.md`. (Project 1)
12. **What belongs to the core and not to a subsystem?** The core steps the subsystems, joins their parts into the game model, and keeps time and recordings. The exact line between the core and the built-in subsystems is not settled. (Project 1)
13. **How does a kept bookmark stay valid when the game model changes?** A bookmark that is stored as a snapshot goes out of date when a component changes. A bookmark that is stored as a recording from the start always loads, but the same inputs can lead to a different place after a rule changes. The answer affects checks of expectations. (Projects 1, 5)

## Directives

14. **What happens to a hand-written version of a behavior when a new prompt follows it?** The proposal is that the agent starts from the hand-written code. It is not settled if the designer gets a warning, as for a hand edit to a generated room, and if the checks stay. (Project 3)
15. **How is a field identified and named?** The proposal is an ID that code uses and a label that the designer can change. It is not settled how an ID is made, when the designer sees it, and if the same applies to each registered thing. (Projects 1, 3)
16. **How is a name in a prompt linked to a registered thing?** It is not settled how the agent identifies the correct thing, how the link is stored, and what happens when the thing gets a new name or is removed. (Project 3)
17. **How does the agent write and run a check for a behavior?** (Projects 3, 5)
18. **How are conflicts handled on a reapply?** The brainstorm noted this risk and did not resolve it. (Project 4)
19. **When is a reapply a refresh, and when is it a regenerate?** The designer can select the kind, or the agent can select it from the change to the prompt. (Project 4)
20. **What happens on a reapply to a thing that the run did not make?** Example: a thing that was put in the room later. It can stay, the agent can put it in position again, or it can be removed with a warning. (Project 4)
21. **How does a thing keep its ID across a reapply?** The agent must decide which new thing is the same as an old thing. (Project 4)
22. **How does one asset prompt depend on another?** The rubble prompt ran on the room that a different prompt made. A reapply of the room can make a new run of the rubble prompt necessary. (Project 4)
23. **How is the first source found through a long chain of things that are made during play?** No design exists. This is not a problem now. (Later)
24. **How precise must an expectation be before it becomes an automated test?** (Project 5)
25. **How does the agent check an expectation that says something is not possible?** "Cannot cross the gap without the grapple" says that no inputs get the player across. One failed jump does not show that. The agent must search over ways to play, or reason from values such as the jump distance. (Project 5)
26. **Where does a check of an expectation start?** The player must be in the correct place with the correct items. This depends on the question about kept bookmarks. (Project 5)
27. **How does the agent know which expectations a change can affect?** (Project 5)
28. **What does a failed expectation do?** It can block the change, give a warning, or ask the designer. (Project 5)
29. **Who writes an expectation?** Only the designer, or also the agent when a prompt implies one, as "too wide to jump" does. (Project 5)
30. **What happens when the designer breaks an expectation on purpose?** (Project 5)

## Assembly

31. **Which libraries provide each subsystem for the first game?** Renderer: PixiJS or Phaser. Live state: an ECS library or custom code. Authored scenes: LDtk, Tiled, or a custom format. The facts about these libraries are unverified. (Project 1)
32. **Is a toolkit for in-game user interface part of the base?** The owner is not sure. (Later)
33. **Which image model generates sprites, and how is one style kept?** (Project 4)
34. **How is sound and music generated or imported?** Not discussed. (Later)

## Project

35. **What is the order of the roadmap projects?** See the proposal in `roadmap.md`.
36. **What npm scope do the packages use?** This repository uses `@twin-digital/*` for most products and `@thrashplay/*` for Farwatch. (Project 1)
37. **Is Wishem the final name?** The owner chose it as a working name. No product, npm package, or GitHub account with the name was found on 2026-11-22. Wishew, an iOS app, is one letter away. Trademarks were not checked.

## Brand

38. **What is the logo mark?** The options from the brand basics are a spark, a lantern, and a small clay figure. See `brand.md`. (Project 6)
39. **What is the illustration style?** (Project 6)
40. **How does the agent's activity move on the screen?** The brand gives the agent the color Wisp. The motion is not designed. (Project 6)
