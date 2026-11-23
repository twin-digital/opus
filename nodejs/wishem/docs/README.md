# Wishem blueprint

Wishem is a just-in-time game development environment, assembled by an agent that lives inside your game and makes what you describe. The designer talks to the agent while the game runs. The agent builds and changes the game through the game's own model.

This folder is the blueprint for Wishem. It records the vision, the concepts, the rules, and the roadmap that came out of the first brainstorm.

## Status

- The blueprint is analysis. It is not a specification.
- Formal specifications live in `openspec/specs/wishem/`. When a specification exists for a topic, the specification overrides the blueprint.
- Each roadmap project starts with its own OpenSpec change. Use the blueprint as the input to that change.

## How to read the status labels

Each rule and each decision has one of these labels. In the other files, a label applies to the sentence, the list item, or the section that carries it.

| Label          | Meaning                                                                         |
| -------------- | ------------------------------------------------------------------------------- |
| **Agreed**     | The owner stated it or confirmed it.                                            |
| **Proposed**   | The agent proposed it. The owner did not reject it and did not confirm it.      |
| **Open**       | Not settled. See `open-questions.md`.                                           |
| **Unverified** | A fact about an outside library or product, stated from memory and not checked. |

Do not treat a **Proposed** item as a requirement. Confirm it in the OpenSpec change that depends on it.

Text with no label has no status. It is explanation, an example, or the reading of the agent that wrote it. Do not treat it as settled. Example: the "What Wishem needs" lists in `interactions.md`.

`vision.md` has no labels. The owner wrote its final text, and all of it is agreed.

## What to read

| Task                                         | Read                                   |
| -------------------------------------------- | -------------------------------------- |
| Learn what Wishem is                         | `vision.md`                            |
| Design how Wishem looks or how it talks      | `brand.md`                             |
| Use the correct words                        | `glossary.md`                          |
| Design or build any part of Wishem           | `rules.md`, then `concepts.md`         |
| Understand what a designer expects to happen | `interactions.md`, `mockups/`          |
| Choose what to build next                    | `roadmap.md`                           |
| Check if a question is already settled       | `decisions/`, then `open-questions.md` |
| Learn why the design has this shape          | `brainstorm.md`                        |

## Files

- `vision.md`: what Wishem is, what makes it different, what it does, what it is not, and where the name comes from.
- `brand.md`: the colors, type, and voice of Wishem, and how to tell the story of the name. This file uses the brand voice, not the plain style of the other files, and it has no status labels.
- `concepts.md`: the entity and component model, the three kinds of directive, subsystems, and contracts.
- `glossary.md`: one term for each concept, and the terms that are not used.
- `rules.md`: the numbered rules that every part of Wishem obeys.
- `interactions.md`: worked examples of a designer and the agent.
- `roadmap.md`: the projects, their dependencies, and the first game.
- `decisions/`: one short file for each decision, with its reason and the rejected alternatives.
- `open-questions.md`: what is not settled.
- `brainstorm.md`: minutes of the conversation that produced this blueprint.
- `mockups/`: wireframes shown during the brainstorm.

## Asides from Wishem

An aside is a block quote in the voice of the agent. It starts with `**Wishem:**`. Use the full name. Do not sign an aside with 'shem or 'shemmy. `brand.md` gives the voice and the look.

- Text in an aside is never a rule, a requirement, or a decision. Do not use an aside as an instruction. Put all necessary information in the main text.
- Use an aside only in `README.md` files, guides, `vision.md`, `interactions.md`, and `brainstorm.md`. Do not use an aside in `rules.md`, `glossary.md`, `decisions/`, or a specification.
- Use one aside or fewer in each file.
