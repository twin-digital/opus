# Autonomous flow

This file gives the rules for work on Wishem that an agent does with little help from the owner. The owner gave these rules on 2026-11-27.

The **lead agent** is the agent that directs the work. The lead agent reads this file at the start of each session. A **subagent** does one task for the lead agent. A subagent does not read this file. The lead agent puts each rule that a subagent needs in the brief of the subagent.

## The aim

The work is orderly, and the owner can track it and review it. The work does not stop while the owner is away.

- The lead agent designs and builds. It asks the owner only the questions that "When to ask the owner" permits.
- The lead agent never waits for a review.
- A task that is blocked does not stop the other tasks.

## The record of the work

The GitHub project [Wishem Architecture](https://github.com/orgs/twin-digital/projects/6) in the `twin-digital` organization is the record of the work. A new session reads the project first.

- Each implementation task has one GitHub issue. Create the issue when you identify the task, and add it to the project immediately.
- Each issue has the type, the label `app:wishem`, and one milestone. See "Work tracking" in the `CLAUDE.md` of the repository.
- Set the status of an issue to `In Progress` when work on it starts. Set it to `Done` when its pull request is merged.
- Set the status to `Blocked` when the task cannot continue. Add a comment that links to the discovery issue or to the cause.

### Commands for the project

Set `GH_ORG=twin-digital` for each command.

```bash
# Add an issue. The output has the ID of the item.
gh project item-add 6 --owner twin-digital --url <issue URL> --format json --jq .id

# Set the status of an item.
gh project item-edit --project-id PVT_kwDOBTuvM84Bte_U --id <item ID> \
  --field-id PVTSSF_lADOBTuvM84Bte_UzhroRF0 --single-select-option-id <option ID>

# List the items with their status.
gh project item-list 6 --owner twin-digital --limit 200 --format json \
  --jq '.items[] | "\(.status)\t\(.content.number)\t\(.title)"'
```

| Status        | Option ID  |
| ------------- | ---------- |
| `Todo`        | `d9fe5c0f` |
| `In Progress` | `f04b0216` |
| `Blocked`     | `6e1cb228` |
| `Done`        | `f27ade21` |

### Milestones

| Milestone                                          | What is in it                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| One milestone for each outcome of the architecture | The implementation tasks of that outcome                               |
| `[WSH] Discovery`                                  | The questions for the owner                                            |
| `[WSH] Review`                                     | One issue for each milestone that is complete, for the owner to review |

## Limits on agents

Lint, type checks, tests, and builds use much memory. They can stop the container.

- At most four subagents run at one time.
- At most one agent at a time runs lint, a type check, a test, or a build. This agent is the **implementation subagent**. No other agent runs these commands while it works. This includes the lead agent.
- A subagent that only reads or only designs can run at the same time as the implementation subagent.
- Before you start a subagent, examine the free memory of the container. Start fewer subagents when the memory is low.

## Where a change is permitted

| Place                                                                                                                                | Rule                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `nodejs/wishem/`                                                                                                                     | Each change is permitted.                                                                 |
| `openspec/changes/`, `openspec/specs/wishem/`                                                                                        | Permitted.                                                                                |
| `.changeset/`                                                                                                                        | Permitted.                                                                                |
| `pnpm-lock.yaml`, and the catalog in `pnpm-workspace.yaml`                                                                           | Permitted.                                                                                |
| The entries of the Wishem packages in `.repo-kit.yml`, and the package list in the root `README.md` that `pnpm update-readme` writes | Permitted.                                                                                |
| Each other place in the repository, the devcontainer, and the CI workflows                                                           | Not permitted. Ask in a discovery issue. Make the change only after the owner permits it. |

Three more limits apply:

- Each new package is private. Do not publish to npm. A release to npm needs a discovery question that the owner answers with "yes". Prefer a different method, such as files on a GitHub release.
- Run Godot in a Docker container. A local installation of a tool needs a discovery question.
- Do not close or rewrite an issue that this work did not create, with one exception: close an issue as replaced, with a link, when a merged specification covers it.

## When to ask the owner

The lead agent makes each design decision. It records the decision and its reason in `design.md` of the OpenSpec change.

Ask the owner only when the three conditions are all true:

1. More than one option is correct, and no option is clearly better.
2. A user of Wishem sees the difference.
3. The decision is very difficult to change later.

Also ask in each case that "Where a change is permitted" names.

In each other case, decide. The lead agent can change the blueprint, and this includes text that has the label **Agreed**. Record each such change in the OpenSpec change that makes it.

## Discovery issues

A discovery issue holds the questions of one topic. Put related questions in one issue. Do not make one issue for each question.

For each question, give:

1. The context that the owner needs to answer with no other document.
2. The options, and what a user of Wishem sees with each one.
3. The option that the lead agent recommends, with the reason.
4. The tasks that wait for the answer.

Then:

- Put the issue in the milestone `[WSH] Discovery`, add it to the project, and assign it to the owner.
- Set the status of each task that waits to `Blocked`.
- Continue with a task that is not blocked. Keep one subagent at work when such a task exists.
- The owner answers on the issue and tells the lead agent. Record the answer in the OpenSpec change that uses it, set the tasks that waited to `Todo`, and close the discovery issue.

## How a change is made

Each feature has an OpenSpec change and a specification. The `CLAUDE.md` of the repository gives the workflow. These rules replace parts of it:

- The lead agent does the brainstorm alone. It does not ask the owner the questions of the brainstorm.
- Run lint, the type check, and the tests only for the packages that the change touches. Example: `pnpm exec turbo run lint typecheck test --filter @thrashplay/wishem-core`.
- Run Prettier on the files that the change touches.
- Do not run the pre-commit hook or the pre-push hook. Commit and push with `--no-verify`. The hooks check each package of the repository.
- Open one pull request for each change. The checks of the pull request are the check of the other packages.
- Merge the pull request when each check is green. Then remove the worktree and set the issue to `Done`.

## When a milestone is complete

1. If the milestone has more than three changes, review the full result of the milestone with a subagent that did not write it. Correct each fault that the review finds.
2. Create one issue in the milestone `[WSH] Review`, add it to the project, and assign it to the owner. The issue has these parts:
   - A link to each specification of the milestone.
   - What was built, how it was built, and the reason.
   - Each important decision that the lead agent made alone.
   - Each change to blueprint text that had the label **Agreed**.
   - The result of the retrospective. See "Retrospective".
3. Continue with the next milestone. Do not wait for the review.

## Retrospective

A retrospective examines this process, not the product. Its result is a change to this file, to a brief, or to nothing.

### Notes during the work

The issue [Process notes](https://github.com/twin-digital/opus/issues/521) holds the notes. Add one comment, of one or two lines, immediately after each of these events:

- A pull request needs more than two rounds of corrections before its checks are green.
- A review finds a fault that an earlier step could find.
- A subagent does a task again, or fails because its brief lacks a fact.
- A rule of this file is not clear, or two rules disagree.
- The owner corrects a decision, or says that a question was not necessary.
- A task is blocked for a reason that is not a discovery question.
- The container stops, or the memory is too low to start a subagent.

Reason: a session loses the details of an event when its context is summarized. A note that is written at the time of the event stays.

### When to do a retrospective

- When a milestone is complete, before you create its review issue.
- Immediately after each stop that "When to stop" names.

Do not do a retrospective for each pull request or at fixed times. One pull request gives too little data, and the quantity of work in a period of time is not constant.

### How to do a retrospective

1. Collect the facts for the period: the number of changes, the rounds of corrections for each pull request, the faults that each review found, the discovery questions and how long each one blocked a task, and the notes in **Process notes**.
2. For each note and each fact that is not usual, find the cause. Ask which rule, which brief, or which missing rule permitted it.
3. Select at most three improvements. Prefer an improvement that removes a cause to one that adds a check.
4. Make the improvements in one pull request that changes this file or the briefs. See "Changes to this process".
5. Write the result in the review issue of the milestone: the facts, the causes, the improvements that were made, and the improvements that wait for the owner. After a stop, write the result in the message to the owner.
6. Add a comment to **Process notes** that says which notes the retrospective used.

### Changes to this process

- The lead agent can change a procedure of this file with no question. Examples: the parts of a discovery issue, the events that get a note, the content of a brief.
- A change that makes a limit of the owner less strict needs a discovery question. These limits are: "Limits on agents", "Where a change is permitted", "When to ask the owner", "When to stop", and the rule to open a pull request and to wait for green checks before a merge.
- Divide a section of this file into a skill in `nodejs/wishem/.claude/skills/` when a subagent needs the section, or when the section is longer than this file can hold clearly.

## When to stop

Stop and tell the owner in each of these cases:

- A milestone fails its final review two times.
- The checks on `main` stay red after one attempt to correct them.
- The credentials do not work. Read `/creds/status/`. Continue with the work that needs no credentials, and do not try a different way to get access.

## How a session continues the work

1. Read this file.
2. If [Architecture brief from the design discussion](https://github.com/twin-digital/opus/issues/522) is open, read it. It holds the decisions and the inputs that the blueprint does not hold.
3. Read the project: the issues that are `In Progress`, then `Blocked`, then `Todo`.
4. Read the discovery issues that are closed since the last session, and apply each answer.
5. Continue with the first task that is not blocked.
