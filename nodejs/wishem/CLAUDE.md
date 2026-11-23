# Wishem

Wishem is a just-in-time game development environment, assembled by an agent that lives inside your game and makes what you describe. The designer talks to the agent while the product runs. The agent builds and changes the product through the model of the product.

The `docs/` folder holds the blueprint.

## Read before you design or build

1. `docs/README.md`: the status labels and what to read for each task.
2. `docs/rules.md`: the rules that every part of Wishem obeys, with the reason for each rule and the alternatives that were rejected.
3. `docs/glossary.md`: the exact terms to use.
4. `docs/brand.md`: before you design a user interface or write what the agent says to the designer.

## How to work

- Plan each roadmap project as an OpenSpec change. Start from the GitHub issue of the project. `docs/roadmap.md` gives the issue of each project.
- Record each thing that is not settled in the GitHub issue of its topic. If the topic has no issue, create one with the label `app:wishem`. The blueprint has no list of open questions. To find the issues, use the label `app:wishem` or the [Wishem project](https://github.com/orgs/twin-digital/projects/5).
- A specification in `openspec/specs/wishem/` overrides the blueprint on the same topic.
- Only text marked **Agreed** is settled. Text with no label has no status. Do not treat an item marked **Proposed** as a requirement. Confirm it with the owner in the change that depends on it.
- When a change settles a **Proposed** or **Open** item, update the blueprint in the same change.
- A design that breaks a rule in `docs/rules.md` needs the agreement of the owner and a change to the rule first.
- Before you propose a change, read the lines that start with "Rejected:" in `docs/rules.md`.
- A block quote that starts with `**Wishem:**` is an aside. It is never a requirement. To write one, follow `docs/README.md` and `docs/brand.md`.
