# Rules for a break-test in this project

These rules apply on top of the `break-test` skill. Where they differ from the skill, these rules win. They add to the skill. They do not remove a step of it.

## The two passes

- Do each step of the skill. This includes the two passes: the pass by mutation, and the inventory of the tests.
- The inventory gives each test, and each row of a test with a table of cases, the class PROVEN, WEAK, or CANNOT FAIL. Examine the helpers and the fixtures also.
- Record the first-pass totals before you change a test.
- A brief does not replace the skill. If a brief and the skill disagree on a step, do the step and say so in your report.

## The runner

- Use the runner of the skill, `scripts/mutants.mjs` in the folder of the `break-test` skill. Do not write your own script for the mutations.
- The runner keeps its files in `.superpowers/break-test/` of your own worktree. Git ignores that folder. Put your list of mutations in that folder also.
- Do not write a file to a place that other agents share, such as the scratchpad of the session or `/tmp`.
- The runner restores each mutant from the object database of git and compares the git blob ID of each protected file with its ID at `init`. Do not use `git checkout` or `git stash` to restore: a different git process in the worktree can make them fail.

## The lock

- Give the runner the shared lock at `init`: `--lock-file /tmp/wishem-heavy.lock`. Each run of the tests then takes the lock for that run only.
- If the runner stops with exit code 4 and says that the wait for the lock ended, do not try again: stop and report it with the output of `lslocks`.
- Each other heavy command, such as the final check, has the form `flock -w 1200 /tmp/wishem-heavy.lock timeout 900 <command>`.
- Give the runner a test command that runs only the test files that cover the mutated files, where that is sufficient. Never run a command for the whole repository.

## No background work

- Do not use `run_in_background`, the Monitor tool, `nohup`, or `&`. A session that waits for background work can lose its worktree.
- Call `run` of the runner in the foreground. Each call stops after its time budget and prints the `--from` value for the next call. Set the `timeout` of the Bash call to 540000.

## Scope

- For a mutant that survives where the spec requires the behavior, add or strengthen a test so that the mutant dies. Do not change non-test source.
- Rework each WEAK test and each CANNOT FAIL test so that it checks what its name says, and prove it with a mutation. This is in the scope of a break-test. Do not change a PROVEN test.
- If a survivor shows a real defect, an ambiguity of the spec, or dead code, do not correct it: put it in the list "Out of scope findings" of your report.
- Put each new test in the describe block of the behavior that it covers. No block named after the break-test. Test names and comments use ASD-STE100 Simplified Technical English and are short.
- Limit the mutants to a number that the time permits: at most 90 for one source file. Prefer mutants of conditions, boundaries, return values, and removed statements to mutants of message text.

## The end

- `verify` of the runner says that the protected files are equal to the state at `init`, and `git status` shows no change to a non-test source file.
- Run the final check under the lock, format the changed files with `pnpm exec prettier --write`, and commit the new tests with `git commit --no-verify` and no attribution lines. Do not push.
- Write the full report of the skill, with each of its nine items, to `.superpowers/break-test/report.md` of your worktree.
- Reply to the lead agent with a summary of less than 350 words: the first-pass totals of the mutants and of the tests for each file, each survivor and each test that is not PROVEN with what you did, the list "Out of scope findings", each step of the skill that you did not do with the reason, and the commit SHA or "no commit".

## For the lead agent

- When a break-test reports, run `verify` of the runner in that worktree before you continue.
- Read the list of steps that the agent did not do. A break-test with a step that is not done is not complete. Send the agent back, or tell the owner.
- Put the totals of the two passes in the description of the pull request.
