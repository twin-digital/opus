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
- An issue that is for the owner has its own type. A discovery issue has the type `Question`. A review issue has the type `Review`. Each other issue has the type `Feature`, `Bug`, or `Task`.
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
- At most one lint, type check, test, or build command runs at one time. A lock makes this sure. Each agent, and this includes the lead agent, runs each such command in this form:

  ```bash
  flock /tmp/wishem-heavy.lock <command>
  ```

  The command waits while a different agent holds the lock. The lock is the same file for each worktree. The system releases the lock when the command ends or its agent stops.

- An agent holds the lock for one command only. A break-test takes the lock for each run of the tests, not for the full break-test.
- More than one subagent can implement at the same time, each one in the worktree of its change. Each other work of an agent, such as to read, to write, and to design, needs no lock.
- `pnpm install`, `pnpm sync`, Prettier, and `git` need no lock.
- Before you start a subagent, examine the free memory of the container. Start fewer subagents when the memory is low.
- Enter the worktree of a change before you start a subagent for it. A subagent keeps the worktree in which it starts, also when the lead agent enters a different worktree later. A subagent that starts in the main checkout cannot enter a worktree.
- Two changes that each add a package both change `pnpm-lock.yaml` and the package list of the root `README.md`. After the first one is merged, update the branch of the second one, and make the two files again if they have a conflict.

## Where a change is permitted

| Place                                                                                                                                | Rule                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `nodejs/wishem/`                                                                                                                     | Each change is permitted.                                                                 |
| `openspec/changes/`, `openspec/specs/wishem/`                                                                                        | Permitted.                                                                                |
| `.changeset/`                                                                                                                        | Permitted.                                                                                |
| `pnpm-lock.yaml`, and the catalog in `pnpm-workspace.yaml`                                                                           | Permitted.                                                                                |
| The entries of the Wishem packages in `.repo-kit.yml`, and the package list in the root `README.md` that `pnpm update-readme` writes | Permitted.                                                                                |
| The entries of `turbo.json` and `.gitignore` that name a Wishem package or a path in `nodejs/wishem/`                                | Permitted.                                                                                |
| Each other place in the repository, the devcontainer, and the CI workflows                                                           | Not permitted. Ask in a discovery issue. Make the change only after the owner permits it. |

Three more limits apply:

- Each new package is private. Do not publish to npm. A release to npm needs a discovery question that the owner answers with "yes". Prefer a different method, such as files on a GitHub release.
- A release of Wishem is a prerelease on GitHub that the lead agent makes by hand with `gh release create`. The lead agent can create the tag and the prerelease in `twin-digital/opus`, on the condition that each npm package of Wishem is private. Each archive has the notice "All rights reserved". Wishem has no licence.
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

- Give the issue the type `Question`. Put it in the milestone `[WSH] Discovery`, add it to the project, and assign it to the owner.
- Set the status of each task that waits to `Blocked`.
- Continue with a task that is not blocked. Keep one subagent at work when such a task exists.
- When no task can start after the task in progress, see "A notice to the phone of the owner".
- The owner answers in a comment on the issue and tells the lead agent. The owner does not close the issue.
- The lead agent records the answer in the OpenSpec change that uses it. If that change does not exist, the lead agent records the answer in a comment on the issue of each task that waited. Then the lead agent sets the tasks that waited to `Todo` and closes the discovery issue.
- An answer that changes a limit of the owner also changes this file, in a pull request.

## How a change is made

Each feature has an OpenSpec change and a specification. The `CLAUDE.md` of the repository gives the workflow. These rules replace parts of it:

- The lead agent does the brainstorm alone. It does not ask the owner the questions of the brainstorm.
- Run lint, the type check, and the tests only for the packages that the change touches. Example: `pnpm exec turbo run lint typecheck test --filter @thrashplay/wishem-core`.
- Run Prettier on the files that the change touches.
- Do not run the pre-commit hook or the pre-push hook. Commit and push with `--no-verify`. The hooks check each package of the repository.
- Open one pull request for each change. The checks of the pull request are the check of the other packages.
- The rules of `main` require that the branch is up to date. When `main` has a new commit, run `gh pr update-branch <number>` and wait for the checks again.
- Merge the pull request with a squash merge when each check is green. Then remove the worktree and set the issue to `Done`.

## The scope of a task

A task does what its issue and its plan say. Work on a task finds other things: a fault in code that the task did not change, an improvement, a minor finding of a review. Do not do them in the task. Reason: a task that grows causes rework, and its pull request is harder to review.

Correct a finding in the task only when one of these conditions is true:

- The change does not do what its specification says.
- A check of the pull request fails.
- A later correction needs a breaking change to an interface that the task adds.

For each other finding, create a follow-up issue:

- Give the issue the type, the label `app:wishem`, and a milestone: the milestone of the outcome that the finding belongs to, or `[WSH] R1 Tech Debt`. Add it to the project.
- Put a link to the pull request or to the review that found it in the issue.
- Put related findings of one review in one issue.
- Start a follow-up issue in its turn, as each other task. A follow-up issue that changes no behavior does not need an OpenSpec change.

The brief of each subagent says: report each thing that is not in the scope of the task, and do not correct it.

## When a milestone is complete

1. If the milestone has more than three changes, review the full result of the milestone with a subagent that did not write it. Correct each fault that the review finds.
2. Create one issue with the type `Review` in the milestone `[WSH] Review`, add it to the project, and assign it to the owner. The issue has these parts:
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

## A notice to the phone of the owner

The Pushover credentials are in the file `~/.pushover.env`. The file has two lines of the form `NAME=value`, with the names `PUSHOVER_API_TOKEN` and `PUSHOVER_USER_KEY`. Do the steps of this section only if that file exists. If it does not exist, ignore this section.

Do not print the credentials. Do not write them in a file of the repository, in an issue, or in a brief.

GitHub tells the owner about each discovery issue and each review issue, because the issue is assigned to the owner. A notice to the phone is for the cases in which the work stops or is about to stop.

### When to send a notice

- **The work is about to stop.** No task with the status `Todo` can start, and at least one task is `Blocked` by a discovery issue. Send the notice when this condition becomes true, also when an agent still works on a task. Reason: the owner can answer before that agent completes its task, and then the work does not stop.
- **The work stopped.** Each case of "When to stop": a milestone fails its final review two times, the checks on `main` stay red, or the credentials do not work.

Send one notice for each set of open discovery issues. Send a new notice only when the set changes. Do not send a notice for a question that blocks only a part of the work, or for a review issue.

### What a notice holds

- A title that says what the owner must do. Example: "Wishem: answer 2 questions to keep the work going".
- The number and the link of each discovery issue that blocks, or the cause of the stop.
- No secret, no code, and no text of an issue.

### How to send a notice

```bash
set -a; . ~/.pushover.env; set +a
curl --silent --fail --output /dev/null https://api.pushover.net/1/messages.json \
  --form-string "token=$PUSHOVER_API_TOKEN" --form-string "user=$PUSHOVER_USER_KEY" \
  --form-string "title=<title>" --form-string "message=<message>" \
  --form-string "url=<link to the first issue>"
```

A notice that Pushover accepts gives exit code 0.

If the request fails, add a note to **Process notes** and continue. A notice that fails does not stop the work.

## How a session continues the work

1. Read this file.
2. If [Architecture brief from the design discussion](https://github.com/twin-digital/opus/issues/522) is open, read it. It holds the decisions and the inputs that the blueprint does not hold.
3. Read the project: the issues that are `In Progress`, then `Blocked`, then `Todo`.
4. Read the discovery issues that are closed since the last session, and apply each answer.
5. Continue with the first task that is not blocked.
