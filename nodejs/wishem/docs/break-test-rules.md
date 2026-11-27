# Rules for a break-test in this project

These rules apply on top of the `break-test` skill. Where they differ from the skill, these rules win.

## Your files

- Other agents run break-tests at the same time, in other worktrees. They share the scratchpad directory of the session. Do not write a script or a result file to the scratchpad or to `/tmp`.
- Put each script and each result file in the folder `.superpowers/break-test/` of your own worktree. Git ignores that folder. Create it first.
- Save a copy of each source file that you mutate in that folder before the first mutant. Restore a mutant by a copy of the saved file over the source file. Do not use `git checkout` or `git stash` to restore.

## No background work

- Do not use `run_in_background`, the Monitor tool, `nohup`, or `&`. A session that waits for background work can lose its worktree.
- Run the mutants in the foreground, in parts. Each Bash call must end in less than 8 minutes, so give your script a range of mutants (for example `--from 0 --to 40`) and call it one time for each part. Set the `timeout` of the Bash call to 540000.
- The script appends one line for each mutant to a result file (`results.jsonl`), so a part that is stopped loses only one mutant.
- At the start of each part, and at the end of the break-test, compare each mutated source file with its saved copy. If they differ outside a run, restore the file.

## The lock

- Each run of the tests takes the shared lock for that run only: `flock -w 1200 /tmp/wishem-heavy.lock timeout 900 <test command>`. The script takes the lock for each mutant, not for a part.
- If a command ends with exit code 124, or `flock` gives up with exit code 1, do not try again: restore the source file, stop, and report it with the output of `lslocks`.
- Run only the test files that cover the mutated file, where that is sufficient, to keep each run short. Never run a command for the whole repository.

## Scope

- For a mutant that survives where the spec requires the behavior, add or strengthen a test so that the mutant dies. Do not change non-test source. Do not refactor, rename, or reorganize tests that exist.
- If a survivor shows a real defect, an ambiguity of the spec, or dead code, do not correct it: put it in the list "Out of scope findings" of your report.
- Put each new test in the describe block of the behavior that it covers. No block named after the break-test. Test names and comments use ASD-STE100 Simplified Technical English and are short.
- Limit the mutants to a number that the time permits: at most 90 for one source file. Prefer mutants of conditions, boundaries, return values, and removed statements to mutants of message text.

## The end

- `git status` shows no change to a non-test source file.
- Run the final check under the lock, format the changed files with `pnpm exec prettier --write`, and commit the new tests with `git commit --no-verify` and no attribution lines. Do not push.
- Report in less than 350 words: the number of mutants for each file, killed and survived, the mutation score, each survivor with what you did, the list "Out of scope findings", and the commit SHA or "no commit".
