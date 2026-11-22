# 0011. Blueprint first, then OpenSpec

> Blueprint, not a specification. See `../README.md` for the status labels.

**Status:** Agreed

## Decision

The first Wishem project is this blueprint: one file for each purpose in `nodejs/wishem/docs/`. Each later project is planned as an OpenSpec change, and formal specifications live in `openspec/specs/wishem/`.

Wishem is a product inside the opus repository.

## Reason

The blueprint guides and constrains future agents. It is also the starting point for the brainstorm of each later project. It is analysis for future specifications and is not a specification.

## Rejected alternatives

- **One long architecture file.** Every agent would load all of it for every task.
- **OpenSpec capability specifications now.** Nothing is built, and most of the content is intent and vocabulary.
- **A new repository for Wishem.** Rejected by the owner.

## Consequences

- A specification overrides the blueprint on the same topic.
- A change that settles a proposed or open item updates the blueprint in the same change.
