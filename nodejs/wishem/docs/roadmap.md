# Roadmap

> Blueprint, not a specification. See `README.md` for the status labels.

This file is the only part of the blueprint that describes future work. Each milestone has one or more changes. Each change is planned as an OpenSpec change, with its own brainstorm, from its GitHub issue.

## Milestones

The list of milestones is **Agreed**. The order after milestone 0 is **Open**.

| #   | Milestone                                                               | Result                                                                                                                           | Depends on |
| --- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 0   | **Blueprint**                                                           | This folder.                                                                                                                     | None       |
| 1   | [**Core model**](https://github.com/twin-digital/opus/issues/479)       | Entities and components with declared fields. Step, snapshot, restore, rewind, replay, bookmarks. A first renderer adapter.      | 0          |
| 2   | [**Agent access**](https://github.com/twin-digital/opus/issues/480)     | The tools an agent uses on a running product: query, edit, pause, step, replay, and write changes to authored state.             | 1          |
| 3   | [**Behavior prompts**](https://github.com/twin-digital/opus/issues/481) | Behaviors with prompt, code, and history. Code is replaced while the product runs.                                               | 1, 2       |
| 4   | [**Asset prompts**](https://github.com/twin-digital/opus/issues/482)    | Room layouts and sprites from prompts. Provenance, reapply, and the hand-edit warning.                                           | 1, 2       |
| 5   | [**Expectations**](https://github.com/twin-digital/opus/issues/483)     | Expectations stored with rooms and other things. The agent checks changes against them and turns them into tests.                | 1, 2       |
| 6   | [**Tools**](https://github.com/twin-digital/opus/issues/484)            | The designer's view: screen view, inspector, tables derived from declarations, overlays, click to select, drag.                  | 1, 2       |
| 7   | [**Other engines**](https://github.com/twin-digital/opus/issues/485)    | A renderer in another engine, on a link between processes. The architecture work builds the link. Each other part is **Parked.** | 1          |

Each milestone has a GitHub issue and a GitHub milestone. The issue holds what is known about the milestone, its open questions, and its notes. The name of an OpenSpec change starts with the number of its GitHub issue.

Two topics have an issue and are not milestones: the in-game user interface ([#487](https://github.com/twin-digital/opus/issues/487)), and sound and music ([#488](https://github.com/twin-digital/opus/issues/488)).

The first work is the GitHub milestone "Bootstrap workbench UI". It is not a row of the roadmap. It builds thin parts of milestones 1, 2, and 6 for the first slices of the workbench: [#476](https://github.com/twin-digital/opus/issues/476), [#477](https://github.com/twin-digital/opus/issues/477), and [#478](https://github.com/twin-digital/opus/issues/478).

## Architecture work

The architecture work builds the base of a construct: the hub, the subsystems that each construct needs, the link between processes, and the renderers. It builds the base of milestones 1, 2, 6, and 7. The link of milestone 7 is part of this work and is not parked.

The nine results that this work gives are **Agreed**. See the [architecture brief](https://github.com/twin-digital/opus/issues/522). The division into these GitHub milestones is **Proposed**.

| GitHub milestone                 | Result                                                                                                                                                              | Issues                                                                                                                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[WSH] A1 Construct`             | A hub connects subsystems in one process and between processes. The store holds the definitions and the entities, and a storage subsystem keeps the authored state. | [#527](https://github.com/twin-digital/opus/issues/527), [#528](https://github.com/twin-digital/opus/issues/528), [#529](https://github.com/twin-digital/opus/issues/529), [#530](https://github.com/twin-digital/opus/issues/530), [#531](https://github.com/twin-digital/opus/issues/531) |
| `[WSH] A2 Time`                  | A clock advances a construct. A construct can pause, step, rewind, and replay.                                                                                      | [#532](https://github.com/twin-digital/opus/issues/532), [#533](https://github.com/twin-digital/opus/issues/533)                                                                                                                                                                            |
| `[WSH] A3 React views`           | The React renderer is a package with a complete minimum of the view system.                                                                                         | [#534](https://github.com/twin-digital/opus/issues/534), [#535](https://github.com/twin-digital/opus/issues/535)                                                                                                                                                                            |
| `[WSH] A4 Workbench and product` | The workbench mounts a product, changes its authored state, and starts, stops, and controls the constructs of the product.                                          | [#536](https://github.com/twin-digital/opus/issues/536), [#537](https://github.com/twin-digital/opus/issues/537), [#538](https://github.com/twin-digital/opus/issues/538), [#539](https://github.com/twin-digital/opus/issues/539)                                                          |
| `[WSH] A5 Renderers`             | A PixiJS page and a Godot application draw the state of the same hub, and the picture changes when the clock advances.                                              | [#540](https://github.com/twin-digital/opus/issues/540), [#541](https://github.com/twin-digital/opus/issues/541), [#542](https://github.com/twin-digital/opus/issues/542)                                                                                                                   |
| `[WSH] A6 Distribution`          | An end user can run a product. A designer can install the workbench.                                                                                                | [#543](https://github.com/twin-digital/opus/issues/543), [#544](https://github.com/twin-digital/opus/issues/544)                                                                                                                                                                            |

These GitHub milestones are not rows of the roadmap. `concepts.md` gives the design that this work builds.

## Order

**Proposed:** do not finish one milestone before the next one starts. Let the first game pull a thin thread through milestones 1 to 4 early: one room, one hero, one behavior prompt, one generated sprite, one change made from a paused game. Then widen each milestone.

Reason: the milestones exist to serve one conversation between a designer and the agent. A thin thread proves that conversation before any one part is complete.

The owner did not confirm this order.

## The first game

- A top-down adventure in a 3/4 perspective and a 16-bit console style. (**Agreed**)
- The owner builds it with a young collaborator. (**Agreed**)
- The game is a consumer of Wishem and is separate from Wishem. Wishem is the thing that this blueprint describes. (**Agreed**)
- The game has its own folder in this repository. It is not inside `nodejs/wishem/`. (**Agreed**)
- The game is built from scratch on Wishem. (**Agreed**)
- The game's world, characters, and art are original. It uses the mechanics of its genre only. (From the notes that started the brainstorm.)

### Relation to the earlier prototype

An earlier prototype of a game of the same kind exists in a separate repository. It is a throwaway.

- Its art assets are likely to move to the first game. (**Agreed**)
- Its code and workflows do not move. (**Agreed**)

Things in the prototype that agree with this blueprint, as evidence and not as a base to build on:

- game logic in `src/core/` with no renderer imports
- rooms as text files on a world grid, and creatures as data
- a wish for art recipes that store the tool, prompt, seed, and chosen variant with each asset

## Planning method

- Each change is planned as an OpenSpec change in this repository. (**Agreed**)
- Formal specifications live in `openspec/specs/wishem/<area>/<capability>/spec.md`. (**Agreed**, from the repository convention)
- The blueprint is the input to each change. When a change settles a **Proposed** or **Open** item, update the blueprint in the same change.
