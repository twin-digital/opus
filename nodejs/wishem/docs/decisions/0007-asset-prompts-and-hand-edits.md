# 0007. Asset prompts and hand edits

> Blueprint, not a specification. See `../README.md` for the status labels.

**Status:** Agreed

## Decision

A prompt that places things at design time is an asset prompt. Its result is an asset, the same as a generated sprite.

- The prompt is always stored with its result.
- The agent records what a run produced.
- The designer can change the prompt and reapply it.
- The designer can edit the result by hand.
- A hand edit is not written back into the prompt.
- A reapply replaces hand edits. The system warns first.

## Reason

An asset prompt has a one-time effect. It does not create a function that runs again and again. Feeding a hand edit back into the prompt is brittle, because the reason for the edit is not obvious.

## Rejected alternatives

- **A hand edit locks the prompt, as a code edit does for a behavior.** A drag is a natural action on a room and must stay cheap.
- **The agent rewrites the prompt to include the hand edit.** The reason for the edit is unknown.
- **No hand edits. Every change goes through the prompt.** Drag and drop must be supported.

## Consequences

- Reapply can conflict with other changes. This is an open question.
- Proposed: the origin record is kept for each generated thing, so that the warning names the exact things a hand changed.
