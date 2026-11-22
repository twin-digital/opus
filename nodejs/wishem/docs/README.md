# Wishem blueprint

Wishem is a tool that lets a designer wish game elements into existence. The designer talks to an agent while the game runs. The agent builds and changes the game through the game's own model.

This folder is the blueprint for Wishem. It records the vision, the concepts, the rules, and the roadmap that came out of the first brainstorm.

## Status

- No Wishem code exists.
- The blueprint is analysis. It is not a specification.
- Formal specifications live in `openspec/specs/wishem/`. When a specification exists for a topic, the specification overrides the blueprint.
- Each roadmap project starts with its own OpenSpec change. Use the blueprint as the input to that change.

## How to read the status labels

Each rule, concept, and decision has one of these labels.

| Label          | Meaning                                                                         |
| -------------- | ------------------------------------------------------------------------------- |
| **Agreed**     | The owner stated it or confirmed it in the brainstorm.                          |
| **Proposed**   | The agent proposed it. The owner did not reject it and did not confirm it.      |
| **Open**       | Not settled. See `open-questions.md`.                                           |
| **Unverified** | A fact about an outside library or product, stated from memory and not checked. |

Do not treat a **Proposed** item as a requirement. Confirm it in the OpenSpec change that depends on it.

## What to read

| Task                                         | Read                                   |
| -------------------------------------------- | -------------------------------------- |
| Learn what Wishem is                         | `vision.md`                            |
| Use the correct words                        | `glossary.md`                          |
| Design or build any part of Wishem           | `rules.md`, then `concepts.md`         |
| Understand what a designer expects to happen | `interactions.md`, `mockups/`          |
| Choose what to build next                    | `roadmap.md`                           |
| Check if a question is already settled       | `decisions/`, then `open-questions.md` |
| Learn why the design has this shape          | `brainstorm.md`                        |

## Files

- `vision.md`: what Wishem is, who uses it, what it is not, and where the name comes from.
- `concepts.md`: the entity and component model, the three kinds of stored words, slots, and contracts.
- `glossary.md`: one term for each concept, and the terms that are not used.
- `rules.md`: the numbered rules that every part of Wishem obeys.
- `interactions.md`: worked examples of a designer and the agent.
- `roadmap.md`: the projects, their dependencies, and the first game.
- `decisions/`: one short file for each decision, with its reason and the rejected alternatives.
- `open-questions.md`: what is not settled.
- `brainstorm.md`: minutes of the conversation that produced this blueprint.
- `mockups/`: wireframes shown during the brainstorm.
