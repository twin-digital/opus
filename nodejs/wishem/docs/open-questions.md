# Open questions

> Blueprint, not a specification. See `README.md` for the status labels.

These questions are not settled. Each one names the roadmap project that must answer it.

## Experience

1. **What happens in the first minute of an empty project?** The brainstorm started from a project that already has content. What does the designer say first, and what exists before that sentence? (Projects 1, 2)
2. **Where does the conversation with the agent happen?** In a panel inside the tools, in a terminal with a coding agent, or both. (Projects 2, 6)
3. **Which changes does the designer make by hand, and which by request?** A drag is agreed. Editing a field value in an inspector is proposed. (Project 6)
4. **How does the designer review the agent's assumptions?** The mockup shows a list. The owner did not confirm it. (Projects 3, 6)

## Model

5. **Is the entity and component model the fixed core of every game?** Proposed as rule R5. (Project 1)
6. **Is "all state lives in declared fields" a hard rule?** Proposed as rule R4. (Project 1)
7. **What scopes exist for a registered thing?** The brainstorm mentioned scene scope and game scope and settled neither. (Project 1)
8. **Does a rule system exist as data, on top of behaviors as code?** A system of triggers and effects can be read without running it. The proposal is that the agent adds one when a game has enough behaviors of that shape. (Project 3)
9. **How is a change in a paused game written back to authored state?** What happens when the live change conflicts with a file? (Project 2)
10. **Which relations between entities are part of the fixed core?** A room contains entities, and an entity can be attached to another. Which relations exist in every game, and which a game adds, is not settled. (Project 1)
11. **How does a kept bookmark stay valid when the game model changes?** A bookmark that is stored as a snapshot goes out of date when a component changes. A bookmark that is stored as a recording from the start always loads, but the same inputs can lead to a different place after a rule changes. The answer affects checks of designer statements. (Projects 1, 5)

## Stored words

12. **What exactly happens when a person edits the code of a behavior?** The likely direction is a native behavior with a locked prompt. Can a native behavior return to a prompt? (Project 3)
13. **Are fields, checks, and links part of every behavior?** Proposed. (Project 3)
14. **Is generated output kept and edited, or regenerated?** Proposed as rule R11. (Projects 3, 4)
15. **How are conflicts handled on a reapply?** The brainstorm noted this risk and did not resolve it. (Project 4)
16. **How precise must a designer statement be before it becomes an automated test?** (Project 5)

## Assembly

17. **Which libraries fill each slot for the first game?** Renderer: PixiJS or Phaser. Live state: an ECS library or custom code. Authored scenes: LDtk, Tiled, or a custom format. The facts about these libraries are unverified. (Project 1)
18. **Is a toolkit for in-game user interface part of the base?** The owner is not sure. (Later)
19. **Which image model generates sprites, and how is one style kept?** (Project 4)
20. **How is sound and music generated or imported?** Not discussed. (Later)

## Project

21. **What is the order of the roadmap projects?** See the proposal in `roadmap.md`.
22. **What npm scope do the packages use?** This repository uses `@twin-digital/*` for most products and `@thrashplay/*` for Farwatch. (Project 1)
23. **Is Wishem the final name?** The owner chose it as a working name. No product, npm package, or GitHub account with the name was found on 2026-11-22. Wishew, an iOS app, is one letter away. Trademarks were not checked.

## Brand

24. **What is the logo mark?** The options from the brand basics are a spark, a lantern, and a small clay figure. See `brand.md`. (Project 6)
25. **What is the illustration style?** (Project 6)
26. **How does the agent's activity move on the screen?** The brand gives the agent the color Wisp. The motion is not designed. (Project 6)
