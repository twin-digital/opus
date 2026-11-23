# Roadmap

> Blueprint, not a specification. See `README.md` for the status labels.

This file is the only part of the blueprint that describes future work. Each project gets its own OpenSpec change, with its own brainstorm, when its turn comes.

## Projects

The list of projects is **Agreed**. The order after project 0 is **Open**.

| #   | Project                                                                 | Result                                                                                                                     | Depends on |
| --- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 0   | **Blueprint**                                                           | This folder.                                                                                                               | None       |
| 1   | [**Core model**](https://github.com/twin-digital/opus/issues/479)       | Entities and components with declared fields. Step, snapshot, restore, rewind, rerun, bookmarks. A first renderer adapter. | 0          |
| 2   | [**Agent access**](https://github.com/twin-digital/opus/issues/480)     | The tools an agent uses on a running game: query, edit, pause, step, rerun, and write changes to authored state.           | 1          |
| 3   | [**Behavior prompts**](https://github.com/twin-digital/opus/issues/481) | Behaviors with prompt, code, and history. Code is replaced while the game runs.                                            | 1, 2       |
| 4   | [**Asset prompts**](https://github.com/twin-digital/opus/issues/482)    | Room layouts and sprites from prompts. Provenance, reapply, and the hand-edit warning.                                     | 1, 2       |
| 5   | [**Expectations**](https://github.com/twin-digital/opus/issues/483)     | Expectations stored with rooms and other things. The agent checks changes against them and turns them into tests.          | 1, 2       |
| 6   | [**Tools**](https://github.com/twin-digital/opus/issues/484)            | The designer's view: screen view, inspector, tables derived from declarations, overlays, click to select, drag.            | 1, 2       |
| 7   | [**Other engines**](https://github.com/twin-digital/opus/issues/485)    | A wire protocol between the game model and a renderer in another engine. **Parked.**                                       | 1          |

Each project has a GitHub issue and a milestone. The issue holds what is known about the project, its open questions, and its notes. The name of the OpenSpec change starts with the number of the issue.

The first work is the milestone "Bootstrap workbench UI". It is not a roadmap project. It builds thin parts of projects 1, 2, and 6 for the first slices of the workbench: [#476](https://github.com/twin-digital/opus/issues/476), [#477](https://github.com/twin-digital/opus/issues/477), and [#478](https://github.com/twin-digital/opus/issues/478).

## Order

**Proposed:** do not finish one project before the next one starts. Let the first game pull a thin thread through projects 1 to 4 early: one room, one hero, one behavior prompt, one generated sprite, one change made from a paused game. Then widen each project.

Reason: the projects exist to serve one conversation between a designer and the agent. A thin thread proves that conversation before any one part is complete.

The owner did not confirm this order.

## The first game

- A top-down adventure in a 3/4 perspective and a 16-bit console style. (**Agreed**)
- The owner builds it with a young collaborator. (**Agreed**)
- The game is a consumer of Wishem and is its own separate product. Wishem is the product that this blueprint describes. (**Agreed**)
- The game has its own product folder in this repository. It is not inside `nodejs/wishem/`. (**Agreed**)
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

- Each project is planned as an OpenSpec change in this repository. (**Agreed**)
- Formal specifications live in `openspec/specs/wishem/<area>/<capability>/spec.md`. (**Agreed**, from the repository convention)
- The blueprint is the input to each change. When a change settles a **Proposed** or **Open** item, update the blueprint in the same change.
