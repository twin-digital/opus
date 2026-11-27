# Rules for a break-test in this project

These rules apply on top of the `break-test` skill. Where they differ from the skill, these rules win.

## The runner

- Use the runner of the skill, `scripts/mutants.mjs` in the folder of the `break-test` skill. Do not write your own script for the mutations.
- The runner keeps its files in `.superpowers/break-test/` of your own worktree. Git ignores that folder. Put your list of mutations in that folder also.
- Do not write a file to a place that other agents share, such as the scratchpad of the session or `/tmp`.
- The runner restores each mutant from a saved copy and compares a hash of each protected file with its hash at `init`. Do not use `git checkout` or `git stash` to restore.

## The lock

- Give the runner the shared lock at `init`: `--lock-file /tmp/wishem-heavy.lock`. Each run of the tests then takes the lock for that run only.
- If the runner stops with exit code 4 and says that the wait for the lock ended, do not try again: stop and report it with the output of `lslocks`.
- Each other heavy command, such as the final check, has the form `flock -w 1200 /tmp/wishem-heavy.lock timeout 900 <command>`.
- Give the runner a test command that runs only the test files that cover the mutated files, where that is sufficient. Never run a command for the whole repository.

## No background work

- Do not use `run_in_background`, the Monitor tool, `nohup`, or `&`. A session that waits for background work can lose its worktree.
- Call `run` of the runner in the foreground. Each call stops after its time budget and prints the `--from` value for the next call. Set the `timeout` of the Bash call to 540000.

## Scope

- For a mutant that survives where the spec requires the behavior, add or strengthen a test so that the mutant dies. Do not change non-test source. Do not refactor, rename, or reorganize tests that exist.
- If a survivor shows a real defect, an ambiguity of the spec, or dead code, do not correct it: put it in the list "Out of scope findings" of your report.
- Put each new test in the describe block of the behavior that it covers. No block named after the break-test. Test names and comments use ASD-STE100 Simplified Technical English and are short.
- Limit the mutants to a number that the time permits: at most 90 for one source file. Prefer mutants of conditions, boundaries, return values, and removed statements to mutants of message text.

## The end

- `verify` of the runner says that the protected files are equal to the state at `init`, and `git status` shows no change to a non-test source file.
- Run the final check under the lock, format the changed files with `pnpm exec prettier --write`, and commit the new tests with `git commit --no-verify` and no attribution lines. Do not push.
- Report in less than 350 words: the number of mutants for each file, killed and survived, the mutation score, each survivor with what you did, the list "Out of scope findings", and the commit SHA or "no commit".

## For the lead agent

- When a break-test reports, run `verify` of the runner in that worktree before you continue.
