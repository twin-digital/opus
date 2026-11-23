# Rules

> Blueprint, not a specification. See `README.md` for the status labels.

These rules apply to every part of Wishem and to every game made with it. A design that breaks a rule needs a new decision in `decisions/` first.

## Truth and time

**R1. The game model owns all game truth.** (**Agreed**)
Game truth is any state or rule that can change what happens in the game. The model never depends on a renderer, a sound system, or an input device.
Reason: the agent must be able to read, change, and rerun the game without a window.

**R2. A library can hold game truth only if it passes the truth contract.** (**Agreed**)
The contract is in `concepts.md`. A library that only presents the game follows the lighter presentation contract.
Reason: a library that hides state makes rewind and rerun impossible.

**R3. Game time can be stepped, recorded, replayed, and rewound.** (**Agreed**)
The same starting state and the same inputs always give the same result.
Reason: "make the jump high enough so I would have made this" needs the agent to run the designer's exact inputs again.

**R4. All state lives in declared component fields. Behavior code keeps no state of its own.** (**Proposed**)
Reason: a snapshot must contain the whole game. Code with no state can be replaced while the game runs.

## Concepts

**R5. The entity and component model is the same in every game.** (**Proposed**)
An entity is a set of components. A component is declared state with optional behavior. Everything else is chosen for each game.
Reason: the agent needs one stable language across games. Both contracts are written in its terms.

**R6. Every kind of thing is declared and registered.** (**Agreed**)
The agent can always ask what kinds exist, what fields they have, and what they can affect.
Reason: the agent must discover the game's vocabulary. Tools such as tables and inspectors are derived from the declarations.

**R7. Nothing is built before a design needs it.** (**Agreed**)
The model, the tools, and the library adapters grow when a game first needs them.
Reason: the engine is meant to "self-construct" as features are needed to support a design.

## Directives

**R8. A prompt is always stored with its result.** (**Agreed**)
This applies to behaviors, generated sprites, generated room layouts, and every later kind of generated thing.

**R9. For a behavior, the prompt is the source and the code is derived.** (**Agreed**)
Code that does not do what the prompt says is a bug. The fix is a code change. Code that does what the prompt says and that the designer dislikes is a design change. The fix is a prompt change.

**R10. The history of prompts for a behavior is stored with the behavior.** (**Agreed**)

**R11. Generated output is kept, not regenerated.** (**Proposed**)
A changed prompt changes the existing code and leaves the rest alone. A stored image is replaced only when the designer asks.
Reason: two generations from one prompt differ. Tuned behavior and accepted art must not change by accident.

**R12. Hand edits to generated things are allowed. The system warns before a reapply destroys one.** (**Agreed**)
Hand edits are not written back into the prompt. To keep an edit across a reapply, the designer changes the prompt.
Reason: a drag does not say why the designer moved the thing.

**R13. The agent records what each generation run produced.** (**Agreed**)
The record lets a reapply remove the old result and detect hand edits.

## Intent and checking

**R14. Expectations record intent, and the agent checks changes against them.** (**Agreed**)
An expectation states, in natural language, something that must stay true. It is stored with the thing it describes.

**R15. The agent does not search the whole game for side effects that no expectation covers.** (**Agreed**)
Reason: the agent does not know what the designer intends to be possible or impossible.

**R16. The agent states the assumptions it made.** (**Proposed**)
When the agent chooses a value or a meaning without asking, the designer can see that choice.

## Scope

**R17. The first renderer is one off-the-shelf library behind an adapter. Other engines wait.** (**Agreed**)
See `decisions/0004-one-renderer-first-protocol-later.md`.

**R18. No single interface hides different truth libraries.** (**Agreed**)
Each game picks its own truth libraries. See `decisions/0003-no-truth-adapters.md`.
