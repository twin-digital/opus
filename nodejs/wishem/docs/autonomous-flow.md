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

| Milestone                                                          | What is in it                                                          |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| One milestone for each outcome of a product or of the architecture | The implementation tasks of that outcome                               |
| `[WSH] Discovery`                                                  | The questions for the owner                                            |
| `[WSH] Review`                                                     | One issue for each milestone that is complete, for the owner to review |
| `[WSH] R1 Tech Debt`                                               | The tasks of review findings that block no outcome                     |
| `[WSH] Later`                                                      | Work that waits until a product needs it                               |

The owner decided on 2026-11-28 that the lead agent creates and manages the milestones and their issues. The lead agent moves, splits, or creates issues and milestones with no question.

## When a milestone is ready

The owner decided on 2026-11-28 when a milestone is ready for autonomous work.

- **The marker.** The label `autonomous:ready` on the GitHub issue of a milestone. The issue of a milestone is the issue that the description of the milestone names in the form `Marker issue: #<number>`. Two groups of milestones have no such line. The issue of a product milestone is the issue in its row of `roadmap.md` (#479 to #485), and the issue of the architecture milestones (A1 to A6) is the architecture brief [#522](https://github.com/twin-digital/opus/issues/522). A milestone with the label is **released**. A milestone without the label is **held**.
- **Who sets it.** Only the owner sets or removes the label. The lead agent never does. The owner set the label on #522 on 2026-11-28.
- **What the owner checks before the label.** The milestone has its issues, each with its scope. Each open question is decided or is in a `Question` issue. During the work, the lead agent can still ask in `Question` issues.
- **A held milestone.** The lead agent does not plan, propose, or build its features. It can create an issue in the milestone for a thing that it finds.
- **The owner removes the label.** The lead agent finishes the task in work, stops the work of that milestone, and tells the owner.
- **What runs with no label.** R1 Tech Debt (fixes of findings in code that exists), break-tests, CI faults, and changes to the flow. This work adds no new product behavior.
- **The next milestone.** When a released milestone is complete, the lead agent goes on with the next released milestone: the order of `roadmap.md`, else the lowest number. When no milestone is released, the lead agent works on R1 Tech Debt and tells the owner that no released milestone is left. No held milestone starts by itself.
- **The rules are general.** The steps of this file (planning, apply, review, and completion of a milestone) apply to each released milestone. A rule that names the architecture applies only to the architecture.

To read the label: `GH_ORG=twin-digital gh api repos/twin-digital/opus/issues/<n> --jq '.labels[].name'`. `state.mjs` prints the held milestones.

## Limits on agents

Lint, type checks, tests, and builds use much memory. They can stop the container.

- The owner raised the target to ten subagents at one time on 2026-11-28. The lead agent raises the limit one step at a time, from six.
- The limit goes up one step when the current step lasted at least 30 minutes or had at least three task reports of build-and-test work (an implementer, a break-test, or a final review that ran tests), and the resource log shows memory below 70 % and CPU throttling below 10 % in that period. The owner set this minimum on 2026-11-28.
- The harness of Claude Code also limits the subagents (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`, six by default). Only the owner can change it. A step above that limit waits for the owner.
- The limit goes back one step when memory is above 80 % or throttling is above 20 % for ten minutes.
- The lead agent adds a note to **Process notes** at each step.
- The lead agent starts the resource logger at the start of a session if it does not run: `node nodejs/wishem/docs/flow-scripts/resource-log.mjs`, in the background. The log `~/.local/state/wishem/resources.csv` gives the memory, the CPU, the throttling, and the slots in use of the container, once a minute.
- Lint, type check, test, and build commands run in slots. One lock for each slot makes sure that each slot runs one command at a time. The file `~/.local/state/wishem/heavy-slots` holds the number of slots (default 2, at most 4). The owner set two slots on 2026-11-28 (#686), and asked for a target of four, reached one step at a time. Each agent, and this includes the lead agent, runs each such command from the root of its worktree in this form:

  ```bash
  node nodejs/wishem/docs/flow-scripts/heavy.mjs <command>
  ```

  The script takes the lock of a free slot (`/tmp/wishem-heavy.lock`, then `/tmp/wishem-heavy-2.lock` to `-4.lock`) and runs `timeout 140 <command>`. It holds one lock only, so two commands cannot block each other. The locks are the same files for each worktree. The system releases a lock when the command ends or its agent stops.

- Each call of `heavy.mjs` adds one line to `~/.local/state/wishem/heavy-log.csv`: the slot (or `busy`), the wait before the run, the time of the run, and the exit code. `node nodejs/wishem/docs/flow-scripts/heavy-stats.mjs [<since>]` gives the share of busy calls, the median and the 90th percentile of the wait, and the use of each slot.
- The lead agent adds one slot when the current number of slots lasted at least 30 minutes or had at least three task reports of build-and-test work, and, over at least 20 calls at the current number, the 90th percentile of the wait is more than 30 seconds or more than 20 % of the calls are busy, and the resource log shows memory below 70 % and CPU throttling below 10 %.
- If the resource log (`~/.local/state/wishem/resources.csv`) shows memory above 80 % or CPU throttling above 20 % for ten minutes, the lead agent removes one slot.
- The lead agent changes the number of slots or the limit of subagents, not both in one step, and adds a note to **Process notes** at each step. It also counts the task reports in each hour, to see if a step gives more work done or only more waits.

- The system moves a foreground command of a subagent to the background after approximately 180 seconds, and the subagent then loses the result. Thus each command, with its wait for the lock, ends in less than 150 seconds. Divide a longer job into parts, for example one package for each command.
- The script stops the wait for a slot after 15 seconds, with exit code 75 and no run of the command. The agent then tries the same command again, at most 40 times. Each other exit code is the exit code of the command: do not run the command again for it.
- A command that does not end holds the lock. `timeout 140` stops the command after 140 seconds, with exit code 124.
- A subagent that gets exit code 124, or that does not get the lock in 40 tries, does not try again. It stops and reports the result, with the output of `lslocks`, which shows the process that holds the lock.
- When a subagent reports such a result, the lead agent finds the process that holds the lock, stops it if it does not end, adds a note to **Process notes**, and starts the task again.
- At the start of a session, and after each break-test, the lead agent looks for test processes that are older than 15 minutes (`pgrep -af vitest`) and for a file with the name `core` in a package folder. It stops each such process and removes each such file.

- An agent holds the lock for one command only. A break-test takes the lock for each run of the tests, not for the full break-test. [`break-test-rules.md`](break-test-rules.md) gives the rules for a break-test. Put a link to that file in the brief of each break-test.
- More than one subagent can implement at the same time, each one in the worktree of its change. Each other work of an agent, such as to read, to write, and to design, needs no lock.
- `pnpm install`, `pnpm sync`, Prettier, and `git` need no lock.
- Before you start a subagent, examine the free memory of the container. Start fewer subagents when the memory is low.
- Enter the worktree of a change before you start a subagent for it. A subagent works only in the worktree in which the lead agent is when it starts the subagent. Enter it with the tool EnterWorktree, never with `cd`. A subagent that the lead agent starts after a `cd` is not bound to that worktree, and it cannot write or run commands when the lead agent enters a different worktree (the first planner of #611). A subagent that works keeps the worktree in which it starts, also when the lead agent enters a different worktree. A subagent that starts in the main checkout cannot enter a worktree.
- Do not send a message to a subagent that stopped. Such a subagent gets the worktree in which the lead agent is at that time, and the lead agent then cannot leave that worktree until the subagent reports. Start a new subagent, and give it the report file of the first one.
- A subagent does no background work: no command in the background, no monitor, and no wait for a later event. A subagent that wakes from a wait gets the worktree in which the lead agent is at that time, and then it cannot use git in its own worktree. A long job runs in the foreground, in parts that each end in less than 150 seconds.
- A subagent writes no file to a place that other agents share, such as the scratchpad of the session or `/tmp`. It writes its scripts and its results in `.superpowers/` of its own worktree, which git ignores. The lock file is the one exception. A subagent cannot write a `.md` file there, so each report file of a subagent has the extension `.txt`.
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
- Before each push, run `node nodejs/wishem/docs/flow-scripts/finish-check.mjs` from the root of the worktree. Push only when it prints no FAIL line.
- A planner runs `pnpm exec prettier --write` on the folder of the change before its commit. The check `merge-checks` of a pull request fails for one file that is not in the format.
- Merge the pull request with a squash merge when each check is green. Then remove the worktree and set the issue to `Done`.
- The folder [`flow-scripts`](flow-scripts/) holds the scripts for these steps. `merge-when-green.mjs <number>` waits for the checks of a pull request, merges it, and updates the branch and waits again when `main` moved. The step "merge, or update the branch and wait for the checks" holds the lock file `/tmp/wishem-merge.lock` (`flock`), so that one pull request at a time is in that step. The wait for the first checks is outside the lock. Reason: each merge moves `main`, the other runs then update their branch and lose their round; three runs lost four rounds each on 2026-11-28. Its last line is `<number> merged=<true|false>`. The exit code is 0 when the pull request is merged and 1 when it is not merged. The lead agent does the steps after the merge (the worktree, the board) only after exit code 0. `board.mjs <item ID>=<todo|progress|blocked|done>` sets the status of an item of the project. `break-test-issue.mjs --milestone <number> --package <name> --pr <pull request number> [--pr <pull request number> ...] <file>...` creates the one break-test issue of a library package at the completion of a milestone. The script reads the merge commit of each merged pull request itself, lists the range `<sha>~1..<sha>` of each pull request in the issue, and refuses a pull request that is not merged. Reason: on 2026-11-28 the lead agent three times sent the read of a merge commit and its use in one batch and used a guessed commit, and two break-test issues got a wrong range. The flow uses only this form. The script refuses a file that does not exist on the tree of each merge commit or on `main`, and a milestone or pull request that is not a number. Reason: break-test issue #776 got a path in the place of the range (#799). The option `--dry` prints the title and the body of the issue and creates nothing. `heavy.mjs <command>` runs a heavy command in a slot, and `heavy-stats.mjs` summarizes the waits (see "Limits on agents"). `finish-check.mjs` runs the checks before a push. `resource-log.mjs` writes the resource log (see "Limits on agents"). Run each one with `node`, as one command.

### The steps that a person does

A test of one requirement does not find a fault that needs two features in a sequence. The first test guide found such a fault after each review and each break-test: a hand edit of a file was not followed after the process wrote that file.

- The design of a change that adds or changes a thing that a person can use or see has a section "The test guide". It gives the steps that a person does to see the change work, with real processes and real files, as exact commands and their results. The steps join the change with the features that it meets: a write and then a hand edit, a stop and then a start, an input through the link and then the file on the disk.
- The final reviewer does these steps on the branch before it gives its verdict, and reports the real result of each step. A step that does not give its result is a finding of the grade Important or higher.
- Each step of the test guide that a program can do is also an automated test of the change, in the package of the change (a test with real processes, or a Playwright test, or a script such as `docs/milestones/a4-workbench/page-driver.mjs`). Reason: four bug fixes of the A3 period (#624, #642, #652, #657) were faults of two features in a sequence that only a test guide or a break-test found, after the merge. A test in CI finds such a fault in the next change.
- An automated test with real processes or a browser keeps a margin. Each time limit is at least 3 times the expected time. Each wait has its own limit, and that limit is less than the test timeout. A test with real processes leaves no process behind, on a pass or on a failure: it kills each process that it knows, or its process group. The brief of an implementer and the brief of a reviewer give this rule, and each review checks it. Reason: the two flakes of 2026-11-28 (#767 and #628 Task 4) came from tight limits (#798).
- A test of a signal or of an event during a start holds the start at a known point, and sends the signal or the event at that point. The hold point is an option or an environment variable that only the test sets. A delay or a poll is not a hold point. Reason: the test of a signal during the start of #543 Task 3 sent the signal after a poll of 20 milliseconds, so the signal arrived after the start and the test did not test the start.
- A test of a step that restores a state (a step back, a rewind, a reload) uses a history in which each restored value is different from the current value. Reason: the test of a step back while a construct runs had only ticks that ran, so it could not find that the step back restored `running` `false` (#816, found by the review of the milestone A4).
- When the implementer writes a test of real processes after its code, the implementer breaks the code on purpose, shows that the test fails, and then restores the code. The report gives the failing run. Reason: #543 Task 2 and Task 3 wrote such tests after the code, and one of them could not fail (see the hold point above).
- The test guide of the milestone uses these sections.

### Reviews

- A change with two or more tasks has a review of each task and one final review of the full branch.
- The final reviewer compares the runtime units that the change adds or changes with the container diagram and its table, and runs `node nodejs/wishem/docs/architecture/render.mjs --check`. The check replaces the comparison of the imports by hand. A package, a process, or a relationship that the document does not show is a finding of the grade Important. Reason: the change that added the clock package did not add it to the document, and a milestone with two changes has no review of the full milestone that would find it.
- The final reviewer runs the checks of each package that depends on a changed package, and not only of the changed packages. The final reviewer also runs the tests of these packages. Run `build typecheck test` with the turbo filter `...<package>` (the package and its dependents). Reason: a change of a library package can break the types of a package that imports it (see #663), and a test of a dependent can fail in CI when only the type check ran (a test of `update` failed on #773).
- Each review checks the margin rule for automated tests with real processes or a browser (see "The steps that a person does").
- An integration of a branch that is behind `main` (a merge of `main` with conflicts) lists, in its report, each **Agreed** item of the issue and each requirement that the merge resolution changes. The review of the integration compares the resolution with each item of the issue, not only with the report. Reason: the integration of #497 replaced the native `disabled` of the button with `aria-disabled`, against decision 2 of the issue, and its report said that no agreed item changed. The review found it.
- A change with one task has one review: the final review of the full branch. The diff of the task is the diff of the branch, so a review of the task reads the same code.

### Break-tests

The owner decided on 2026-11-28 that a break-test runs once for each library package when a milestone is complete, and not after each change. Reason: on 2026-11-28, 39 of 121 merged pull requests were test pull requests, most of them break-tests of one change, and changes waited for break-tests of their packages.

- A change gets no break-test issue and no break-test when it is complete. A change is merged after its final review.
- A library package is a package of `nodejs/wishem/` that a different package of `nodejs/wishem/` has in `dependencies`. A package in `devDependencies` only does not count. Reason: the package `docs-check` has each other package in `devDependencies`, and the owner decided on 2026-11-28 that this does not make each package a library package.
- "When a milestone is complete" gives the step that creates the break-test issues.
- The issue of a package has the type `Review`, the title "Break-test: `<package>` in milestone `<milestone number>`", the label `app:wishem`, and the milestone. Add it to the project. Do not assign it to the owner. Create it with `break-test-issue.mjs`.
- The scope of the break-test is the source lines of the package that the merged pull requests of the milestone changed, and the tests that these pull requests added or changed for these lines. Do not include a line that an earlier break-test covered. The issue lists the files and gives the range of commits of each pull request.
- Do one break-test of a package at a time. Break-tests of different packages can run at the same time. A break-test does not take a slot that other work can use: when fewer subagents than the limit run, start the break-tests to fill the slots.
- A break-test runs in a worktree of its own, from `main`. Its result is a pull request that changes tests only, and that closes the issue. The description of the pull request gives the totals of the two passes.
- When a break-test finds no gap and changes no test, close its issue with a comment that gives the totals of the two passes. No pull request is necessary.
- When a break-test finds a fault of the source, create an issue of the type `Bug` for the fault in the milestone. Do not correct the source in the pull request of the break-test.

### Skills and briefs

- Use each skill that the workflow names, as the skill is written: `openspec-propose` for a new change, `openspec-update-change` for a revision, `superpowers:subagent-driven-development` for the apply step, `break-test` with its two passes, `openspec-archive-change`, and `superpowers:finishing-a-development-branch`. At the menu of the last one, select the pull request.
- One step differs from `superpowers:subagent-driven-development`: its fix loop sends a message to the implementer that stopped. Start a new implementer with the report file and the findings. See "Limits on agents".
- A brief does not replace a skill. A brief for work that a skill covers names the skill and tells the subagent to invoke it. The brief does not give the steps of the skill again, does not limit them, and does not remove one.
- When the lead agent does a step in a lighter form than the workflow gives, it tells the owner in the same message, with the reason.

#### What each brief of a planner and of a reviewer holds

A brief of a planner holds each item. A brief of a task reviewer and of a final reviewer holds the items that apply to the task.

- The architecture document (`docs/architecture/README.md` and `render.mjs`) and each README show each package, process, relationship, and import that the change adds, changes, or removes.
- A delta spec that modifies a requirement copies the current text of `main` for that requirement, with each scenario that `main` has, also the scenarios that other changes added. Read the main spec on `main` at the time of the plan, and again before the archive.
- The expected results of "The test guide" come from a real run on `main` where the behavior exists, or say clearly that they are the result after the change.
- Each open issue of the type `Bug` that touches the same files or behavior is named, with what the change does about it.
- One changeset for each distinct change, as `~/.claude/rules/changesets.md` says.
- The margin rule, the hold point, and the restored values for the automated tests of the test guide (see "The steps that a person does"). A brief of an implementer holds them, and a brief of a reviewer holds the check of them.
- A planner does not drop or reduce a feature that the owner named in the issue or in a decision. When the full feature costs much work, the planner plans it in more tasks, or asks the owner. Reason: the owner overruled #650, which left out the arrows of the package view.

### Work at the same time

Keep the lead agent free:

- When the final review of a change is clean, the lead agent starts a finisher subagent (sonnet) in the worktree of the change. The owner decided this on 2026-11-28. The finisher merges `main`, archives the change with the sync of its specs, writes the changesets, runs `finish-check.mjs`, pushes, writes the description of the pull request with the `writing-pull-requests` skill, creates the follow-up issues of "Follow-up" of `design.md`, and marks the pull request ready. Its report lists each "Ruling:" line of the ledger.
- The lead agent keeps the steps that wait or that change the board: it gives the rulings to the owner, runs `merge-when-green.mjs`, sets the board, and removes the worktree after the merge.
- While a long step runs, such as an implementer or a break-test, start the plan of the next change on the board in a new worktree. A plan does not need the merge of the change that it depends on. It needs only the design of that change.
- While a long step runs and no plan can start, start a follow-up issue that touches a different package.
- Work is not limited to one milestone. A task can start when each issue that blocks it is closed, in any released milestone. When fewer subagents than the limit run, look at the tasks of each released milestone and start one that is not blocked. See "When a milestone is ready".
- When two items can start, start the item of the milestone that has the fewest open items. The owner asked on 2026-11-28 for the selection that closes milestones fastest.
- A task of review findings that blocks no outcome of its milestone goes to the milestone `[WSH] R1 Tech Debt` when it is created.

## The scope of a task

A task does what its issue and its plan say. Work on a task finds other things: a fault in code that the task did not change, an improvement, a minor finding of a review. Do not do them in the task, except the case of the final fix wave below. Reason: a task that grows causes rework, and its pull request is harder to review.

Correct a finding in the task only when one of these conditions is true:

- The review of the task gives the finding the level Critical or Important. The task is not complete until its review approves it.
- The change does not do what its specification says.
- A check of the pull request fails.
- A later correction needs a breaking change to an interface that the task adds.

One more case: the final fix wave of a change can fix a Minor finding when the finding is in a file that the change already touches and the fix takes less than about 15 minutes. A scoped re-review checks the fix. The owner decided this on 2026-11-28 (#704).

For each other finding, create a follow-up issue:

- Give the issue the type, the label `app:wishem`, and a milestone: the milestone of the outcome that the finding belongs to, or `[WSH] R1 Tech Debt`. Add it to the project.
- Put a link to the pull request or to the review that found it in the issue.
- Put related findings of one review in one issue.
- Start a follow-up issue in its turn, as each other task. A follow-up issue that changes no behavior does not need an OpenSpec change.

The brief of each subagent says: report each thing that is not in the scope of the task, and do not correct it. The lead agent decides which findings go into the final fix wave.

## When a milestone is complete

1. After the last change of the milestone is merged, create one break-test issue for each library package whose source the changes of the milestone changed. Use `break-test-issue.mjs --milestone <number> --package <name> --pr <n> [--pr <n> ...] <file>...` with the merged pull requests of the milestone that changed the package. See "Break-tests" for the scope.
2. Start the break-tests. Break-tests of different packages can run at the same time. Do one break-test of a package at a time. The milestone is not complete until each break-test is done and each issue of the type `Bug` of the milestone is fixed. A fix of a `Bug` in a library package is in the scope of the break-test of that package when that break-test is still open. When it is closed, the fix gets no new break-test.
3. If the milestone has more than three changes, review the full result of the milestone with a subagent that did not write it. Correct each fault that the review finds.
4. Run a full type check of all Wishem packages, after a build. Run each command from the root of the worktree. Split a command into parts when it takes more than 140 seconds:

   ```bash
   node nodejs/wishem/docs/flow-scripts/heavy.mjs pnpm exec turbo run build --filter './nodejs/wishem/*'
   node nodejs/wishem/docs/flow-scripts/heavy.mjs pnpm exec turbo run typecheck --filter './nodejs/wishem/*'
   ```

   A failure is an issue of the type `Bug` in the milestone R1 Tech Debt. Reason: the owner decided on 2026-11-28 to check each package once at each milestone completion. `main` had a type error in `renderer-pixi` from #535 that no check of a pull request found (fixed by #663).

5. Write the test guide of the milestone. See "The test guide of a milestone".
6. Create one issue with the type `Review` in the milestone `[WSH] Review`, add it to the project, and assign it to the owner. The issue has these parts:
   - A link to the test guide of the milestone.
   - A link to each specification of the milestone.
   - What was built, how it was built, and the reason.
   - Each important decision that the lead agent made alone.
   - Each change to blueprint text that had the label **Agreed**.
   - The result of the retrospective. See "Retrospective".
   - If the milestone published a build that a person can install, and where it is.
7. Continue with the next released milestone (see "When a milestone is ready"). Do not wait for the review.

### Ports and containers of tests

- Each test server of a package uses a port that no other package uses. Reason: CI runs the `test:ui` tasks of the packages at the same time. Two faults of 2026-11-28 came from a shared port (4181, then 4182).
- Do not use a port on the "bad ports" list of the WHATWG Fetch standard. The `WebSocket` of Node.js refuses such a port. Example: 4190.
- A change that adds or moves a port updates the table below in the same change. Find the ports in use with `git grep -n -E '\b4[0-9]{3}\b' -- nodejs/wishem`.

| Port | Package                                          | Use                                              |
| ---- | ------------------------------------------------ | ------------------------------------------------ |
| 4173 | `workbench-app`                                  | static server of the browser tests               |
| 4180 | `workbench-app`                                  | end-to-end server without a product              |
| 4181 | `pixi-page`                                      | page server of the Playwright tests              |
| 4183 | `pixi-page`                                      | construct of the Playwright tests (`--hub-port`) |
| 4184 | `workbench-app`                                  | end-to-end server with a product                 |
| 4186 | `workbench-app`                                  | end-to-end server with a run                     |
| 4188 | `workbench-app`                                  | end-to-end server with a list product (`--list`) |
| 4747 | `host-nodejs`                                    | default port of a construct                      |
| 4748 | `host-nodejs`                                    | example port of a hub in the documentation       |
| 4749 | `renderer-godot`                                 | link of the unit tests of the Godot code         |
| 4750 | `pixi-page`, `three-renderers`, `renderer-godot` | default port of the sample construct             |
| 4751 | `pixi-page`                                      | `--hub-port` of a unit test                      |
| 4760 | `renderer-godot`                                 | `hubPort` of a unit test                         |
| 5173 | `workbench-app`                                  | default port of the page                         |
| 5174 | `pixi-page`                                      | default port of the page                         |
| 5175 | `three-renderers`                                | default port of the page                         |

- A test of two or more packages that run at the same time on one Docker daemon checks only the containers and the processes of its own run. Select them by a label or by a name that is unique to the run (see `godotLabel` in `renderer-godot`). A check of all containers with a label of the package finds the containers of a different package, or of a different run, and removes or reports them wrongly (#542, #767).

### The test guide of a milestone

The owner asked for this document on 2026-11-27. It is the test plan of the milestone, the list of its new features, and a demonstration that a person does alone.

- The file is `nodejs/wishem/docs/milestones/<milestone>.md`, for example `a1-construct.md`. `nodejs/wishem/docs/milestones/README.md` lists the guides.
- The guide starts with what a person needs, and the commands that get it, from a new checkout of the repository.
- The guide has one section for each feature that the milestone added and that a person can use or see. Each section gives the steps as exact commands or actions, and after each step the result that the person sees.
- A feature that only a program can use, such as a function of a library, has a section with the shortest program or command that shows it.
- A subagent that did not build the milestone writes the guide, and it does each step on the `main` branch before it writes the step. A step that does not give its result is a fault: record it as an issue of the type `Bug`, and say so in the guide.
- The guide ends with a list of what the milestone did not build, so that the person does not look for it.

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
  - The lead agent knows that the vended credentials stalled when a file in `/creds/status/` says `stalled`, or when `gh` has no token.
  - Send one notice to the owner (see "A notice to the phone of the owner"). Do not send a second notice for the same stall.
  - Go on with the local work: applies, reviews, and break-tests whose scope the lead agent knows. A step on GitHub waits (a push, a pull request, a merge, an issue, the board).
  - On 2026-11-28 the credentials stalled from about 07:29 UTC. The lead agent sent one notice and finished the apply of #607 and three break-tests while it waited for the owner.

## A notice to the phone of the owner

The Pushover credentials are in the file `~/.pushover.env`. The file has two lines of the form `NAME=value`, with the names `PUSHOVER_API_TOKEN` and `PUSHOVER_USER_KEY`. Do the steps of this section only if that file exists. If it does not exist, ignore this section.

Do not print the credentials. Do not write them in a file of the repository, in an issue, or in a brief.

GitHub tells the owner about each discovery issue and each review issue, because the issue is assigned to the owner. A notice to the phone is for the cases in which the work stops or is about to stop.

### When to send a notice

- **The work is about to stop.** No task with the status `Todo` can start, and at least one task is `Blocked` by a discovery issue. Send the notice when this condition becomes true, also when an agent still works on a task. Reason: the owner can answer before that agent completes its task, and then the work does not stop.
- **The work stopped.** Each case of "When to stop": a milestone fails its final review two times, the checks on `main` stay red, or the credentials do not work.
- **A usage limit stopped a subagent.** A subagent reports that it stopped because of a usage limit of its model. The owner can reset the limit. Send one notice for each such event. The lead agent cannot read the usage, so it cannot send a notice before the limit. When the limit stops the lead agent, no notice is possible.

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

The state of the work is not kept in a summary. A summary is not current after the next step. Each kind of state has one place, and a script reads the places.

| State                                                                                                            | Its place                                                                                          |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| The tasks, their status, their milestones, and what blocks each one                                              | The project and the relations of the issues                                                        |
| A question or a review that waits for the owner                                                                  | An issue of the type `Question` or `Review`, with the owner as assignee                            |
| A decision of the owner about the process                                                                        | This file                                                                                          |
| A decision of the owner about the product                                                                        | `rules.md`, or the specification that it changes                                                   |
| The state of a change in work: the task, the base commits, the rulings of the lead agent, the findings that wait | The ledger of the change                                                                           |
| An order between two changes that the relations of the issues do not show                                        | A "blocked by" relation between the two issues, which the lead agent removes when the order is met |
| A fact about the process, for the next retrospective                                                             | [Process notes](https://github.com/twin-digital/opus/issues/521)                                   |

Rules that keep these places complete:

- A decision of the owner is recorded when it is in one of these places on `main`, or in a comment on the issue that it changes. A decision that is only in the conversation of a session is not recorded.
- Push the branch of a change as a draft pull request when the plan is committed. The plan and each later commit are then not only on one computer.
- Commit the ledger of a change in the folder of the change, as `ledger.md`, after each task and before each push. It is archived with the change, as the record of the rulings.

To start or to continue a session:

1. Read this file.
2. Run `node nodejs/wishem/docs/flow-scripts/state.mjs`. It prints the items of the project that are in work or blocked, the open pull requests with their checks, each worktree of this work with the last lines of its ledger, the issues that wait for the owner, the break-test issues, and the processes that stayed alive.
3. For each change in work, read its ledger in full.
4. Read the comments that the owner added to an issue of the type `Question` or `Review` since the last session, and apply each answer.
5. Continue with each task that is not blocked, to the limit of subagents.
