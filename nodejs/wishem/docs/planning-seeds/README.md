# Planning seeds

> Blueprint, not a specification. See `../README.md` for the status labels.

A planning seed is the start of the brainstorm for one roadmap project. It collects what the blueprint knows about the project and the questions that the project must answer.

The name of each folder is the expected name of the OpenSpec change for the project. When a seed has a GitHub issue, the name of its folder starts with the number of the issue, for example `477-first-workbench-ui-slice`. `README.md` is the main file of a seed. A seed gets more files only when it needs them.

| Seed                                                             | Project          |
| ---------------------------------------------------------------- | ---------------- |
| [`479-add-core-model`](479-add-core-model/README.md)             | Core model       |
| [`480-add-agent-access`](480-add-agent-access/README.md)         | Agent access     |
| [`481-add-behavior-prompts`](481-add-behavior-prompts/README.md) | Behavior prompts |
| [`482-add-asset-prompts`](482-add-asset-prompts/README.md)       | Asset prompts    |
| [`483-add-expectations`](483-add-expectations/README.md)         | Expectations     |
| [`484-add-designer-tools`](484-add-designer-tools/README.md)     | Tools            |
| [`485-add-engine-protocol`](485-add-engine-protocol/README.md)   | Other engines    |

These seeds are not roadmap projects yet:

| Seed                                                                     | Topic                    |
| ------------------------------------------------------------------------ | ------------------------ |
| [`477-first-workbench-ui-slice`](477-first-workbench-ui-slice/README.md) | First workbench UI slice |
| [`478-add-workbench-panels`](478-add-workbench-panels/README.md)         | Workbench panels         |
| [`476-add-core-and-host`](476-add-core-and-host/README.md)               | Core and host            |
| [`add-in-game-ui`](add-in-game-ui/README.md)                             | In-game user interface   |
| [`add-sound-and-music`](add-sound-and-music/README.md)                   | Sound and music          |
| [`define-brand-identity`](define-brand-identity/README.md)               | Brand identity           |
| [`settle-product-name`](settle-product-name/README.md)                   | Product name             |

Record each thing that is not settled in a seed: a question, an idea, or a proposal that needs a brainstorm. If no seed fits, make a new one. The blueprint has no other list of open questions.

When a project starts, use its seed as the input to the OpenSpec change. When the change settles a question, remove the question from the seed and record the answer in the blueprint.
