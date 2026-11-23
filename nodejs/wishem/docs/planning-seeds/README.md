# Planning seeds

> Blueprint, not a specification. See `../README.md` for the status labels.

A planning seed is the start of the brainstorm for one topic that has no GitHub issue. It collects what the blueprint knows about the topic and the questions that the topic must answer.

`README.md` is the main file of a seed. A seed gets more files only when it needs them.

| Seed                                                       | Topic                  |
| ---------------------------------------------------------- | ---------------------- |
| [`add-in-game-ui`](add-in-game-ui/README.md)               | In-game user interface |
| [`add-sound-and-music`](add-sound-and-music/README.md)     | Sound and music        |
| [`define-brand-identity`](define-brand-identity/README.md) | Brand identity         |
| [`settle-product-name`](settle-product-name/README.md)     | Product name           |

## Topics that have an issue

When a topic gets a GitHub issue, the content of its seed moves to the issue and the seed is removed. The issue is then the record of what is agreed, what is proposed, and what is open for that topic.

| Issue                                                   | Topic                    |
| ------------------------------------------------------- | ------------------------ |
| [#476](https://github.com/twin-digital/opus/issues/476) | Core and host            |
| [#477](https://github.com/twin-digital/opus/issues/477) | First workbench UI slice |
| [#478](https://github.com/twin-digital/opus/issues/478) | Workbench panels         |
| [#479](https://github.com/twin-digital/opus/issues/479) | Core model               |
| [#480](https://github.com/twin-digital/opus/issues/480) | Agent access             |
| [#481](https://github.com/twin-digital/opus/issues/481) | Behavior prompts         |
| [#482](https://github.com/twin-digital/opus/issues/482) | Asset prompts            |
| [#483](https://github.com/twin-digital/opus/issues/483) | Expectations             |
| [#484](https://github.com/twin-digital/opus/issues/484) | Tools                    |
| [#485](https://github.com/twin-digital/opus/issues/485) | Other engines            |

## Where to record a thing that is not settled

Record each thing that is not settled: a question, an idea, or a proposal that needs a brainstorm.

- If the topic has an issue, record it in the issue.
- If the topic has a seed, record it in the seed.
- If no issue and no seed fits, make a new seed.

The blueprint has no other list of open questions.

When work on an issue starts, use the issue as the input to the OpenSpec change. When the change settles a question, remove the question from the issue and record the answer in the blueprint.
