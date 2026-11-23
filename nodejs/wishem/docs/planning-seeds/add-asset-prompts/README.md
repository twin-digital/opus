# Asset prompts

> Planning seed, not a specification. It collects what the blueprint knows about this project, as the start of its brainstorm. The folder name is the expected name of the OpenSpec change. See `../../README.md` for the status labels.

## Goal

This project lets the designer ask for assets in natural language: sprites, room layouts, maps, and each other kind of content that the game model defines. Each asset is stored with the prompt that made it.

## Result

- Sprites and room layouts from asset prompts.
- Provenance for each generated thing.
- Reapply, with a warning before a hand edit is lost.

## Depends on

[Core model](../add-core-model/README.md), [Agent access](../add-agent-access/README.md).

## What is agreed

- A prompt is always stored with its result. See rule R8.
- An asset prompt has a one-time effect. It is not a behavior. See [Asset prompts](../../concepts.md#asset-prompts).
- Hand edits are allowed. They are not written back into the prompt. The system warns before a reapply destroys one. See rule R12.
- Each generated thing has provenance: what made it, and what changed it since. See rule R13 and [Provenance](../../concepts.md#provenance-agreed).
- Generated output is kept. A stored asset is replaced only when the designer asks. See rule R11.
- Provenance applies to authored state only. A thing that is made during play links to the thing in the authored state that made it.

## What is proposed

- A reapply affects three groups of things. See [What a reapply affects](../../concepts.md#what-a-reapply-affects-proposed).
- A reapply is a refresh or a regenerate.
- The agent manages the run of a prompt. See [Managed execution of a prompt](../../concepts.md#managed-execution-of-a-prompt-proposed).

## Open questions

1. **How are conflicts handled on a reapply?** The brainstorm noted this risk and did not resolve it.
2. **When is a reapply a refresh, and when is it a regenerate?** The designer can select the kind, or the agent can select it from the change to the prompt.
3. **What happens on a reapply to a thing that the run did not make?** Example: a thing that was put in the room later. It can stay, the agent can put it in position again, or it can be removed with a warning.
4. **How does a thing keep its ID across a reapply?** The agent must decide which new thing is the same as an old thing.
5. **How does one asset prompt depend on another?** The rubble prompt ran on the room that a different prompt made. A reapply of the room can make a new run of the rubble prompt necessary.
6. **Which image model generates sprites, and how is one style kept?**
7. **How is the first source found through a long chain of things that are made during play?** No design exists. This is not a problem now.

## Notes

- Rule R12 in [`rules.md`](../../rules.md) gives the alternatives that are closed for this project.
- Two proposed areas need a brainstorm in this project: the kinds of reapply, and the managed execution of a prompt.
- This project depends on an outside image model. Pixel art in one consistent style is the least certain part of the roadmap.
- An earlier prototype generated sprites with PixelLab and Retro Diffusion. It also showed the need for a stored recipe for each asset: the tool, the prompt, the seed, and the selected result.
