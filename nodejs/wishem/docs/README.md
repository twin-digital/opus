# Wishem blueprint

Wishem is a just-in-time game development environment, assembled by an agent that lives inside your game and makes what you describe. The designer talks to the agent while the product runs. The agent builds and changes the product through the model of the product.

This folder is the blueprint for Wishem. It records the vision, the concepts, the rules, and the roadmap that came out of the first brainstorm.

## Status

- The blueprint is analysis. It is not a specification.
- Formal specifications live in `openspec/specs/wishem/`. When a specification exists for a topic, the specification overrides the blueprint.
- Each milestone of the roadmap has one or more changes. Each change is planned as an OpenSpec change. Use the GitHub issue of the change as the input.

## How to read the status labels

Each rule has one of these labels. In the other files, a label applies to the sentence, the list item, or the section that carries it.

| Label          | Meaning                                                                         |
| -------------- | ------------------------------------------------------------------------------- |
| **Agreed**     | The owner stated it or confirmed it.                                            |
| **Proposed**   | The agent proposed it. The owner did not reject it and did not confirm it.      |
| **Open**       | Not settled. See the GitHub issue for the topic.                                |
| **Unverified** | A fact about an outside library or product, stated from memory and not checked. |

Do not treat a **Proposed** item as a requirement. Confirm it in the OpenSpec change that depends on it.

Text with no label has no status. It is explanation, an example, or the reading of the agent that wrote it. Do not treat it as settled. Example: the "What Wishem needs" lists in `examples/interactions.md`.

`vision.md` has no labels. The owner wrote its final text, and all of it is agreed.

## What to read

| Task                                         | Read                                                               |
| -------------------------------------------- | ------------------------------------------------------------------ |
| Learn what Wishem is                         | `vision.md`                                                        |
| Design how Wishem looks or how it talks      | `brand.md`                                                         |
| See the look of the workbench UI             | `design-system/style-guide-preview.html`                           |
| Use the correct words                        | `glossary.md`                                                      |
| Design or build any part of Wishem           | `rules.md`, then `concepts.md`                                     |
| Understand what a designer expects to happen | `examples/`                                                        |
| Choose what to build next                    | `roadmap.md`                                                       |
| Start the brainstorm for a milestone         | The GitHub issue of the milestone. See `roadmap.md`.               |
| Check if a question is already settled       | `rules.md`, then the GitHub issue for the topic. See `roadmap.md`. |
| See what the workbench is made of            | `architecture/README.md`                                           |
| Learn why the design has this shape          | `brainstorm.md`                                                    |

## Files

- `vision.md`: what Wishem is, what makes it different, what it does, what it is not, and where the name comes from.
- `brand.md`: the colors, type, and voice of Wishem, and how to tell the story of the name. This file uses the brand voice, not the plain style of the other files, and it has no status labels.
- `design-system/style-guide-preview.html`: a static page that shows the design tokens, the typography, and each component of the workbench in each state. It is the result of the brainstorm for [Workbench design system](https://github.com/twin-digital/opus/issues/496). It is a preview, not a specification.
- `../workbench-app/`: the workbench application. Its style guide is the record of how the colors and the type are implemented. It shows the design tokens, the typography, and each component in each state. To start it, run `pnpm --filter @thrashplay/wishem-workbench-app style-guide`.
- `architecture/`: what the workbench is made of, with two diagrams: the processes, and the path from a file to a picture. `render.mjs` writes the SVG files of the diagrams.
- `concepts.md`: the project and its two parts, the entity and component model, the three kinds of directive, subsystems, and contracts.
- `glossary.md`: one term for each concept, and the terms that are not used.
- `rules.md`: the numbered rules that every part of Wishem obeys, with the reason for each rule and the alternatives that were rejected. This file is the record of what is decided until a specification exists.
- `examples/`: worked examples of a designer and the agent, and a wireframe of the editor. An example is an illustration. It is not a rule or a requirement.
- `roadmap.md`: the milestones, their dependencies, and the first game.
- GitHub issues with the label `app:wishem`: one issue for each milestone and for each other topic that is not settled. An issue holds what is known, the open questions, and the ideas. It is the start of the brainstorm for that topic. The blueprint has no list of open questions. `roadmap.md` gives the issues.
- `brainstorm.md`: minutes of the conversation that produced this blueprint.

## Asides from Wishem

An aside is a block quote in the voice of the agent. It starts with `**Wishem:**`. Use the full name. Do not sign an aside with 'shem or 'shemmy. `brand.md` gives the voice and the look.

- Text in an aside is never a rule, a requirement, or a decision. Do not use an aside as an instruction. Put all necessary information in the main text.
- Use an aside only in `README.md` files, guides, `vision.md`, `examples/interactions.md`, and `brainstorm.md`. Do not use an aside in `rules.md`, `glossary.md`, or a specification.
- Use one aside or fewer in each file.
