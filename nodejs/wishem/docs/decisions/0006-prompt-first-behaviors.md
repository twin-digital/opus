# 0006. Behaviors are prompt-first

> Blueprint, not a specification. See `../README.md` for the status labels.

**Status:** Agreed

## Decision

A behavior is stored as the designer's prompt. The agent writes the function behind the prompt. The history of prompts is stored with the behavior.

- Code that does not do what the prompt says is a bug. The code changes.
- Code that does what the prompt says and that the designer dislikes is a design change. The prompt changes.
- A person can view and edit the code. That probably makes the behavior a native behavior with a locked prompt.

## Reason

The owner wants natural-language behaviors. Where a traditional editor has a code editor with a function, Wishem has a text area with the designer's prompt. The agent writes the function behind it.

## Rejected alternatives

- **Behaviors as code that the designer reads.** The designer does not need to read code.
- **Behaviors only as rules in data.** Rules can be read without running them. They cannot express everything, and a rule system must exist first. A rule system can be added later as one more concept.

## Consequences

- The same idea applies to generated assets. See decision 0007.
- The code for a behavior is stored. A prompt change edits the stored code and does not write it again from the start.
- A behavior also has fields and checks. Answers to questions become fields. The agent writes checks from the prompt.
- Names in a prompt are links to registered things. The details are open.
