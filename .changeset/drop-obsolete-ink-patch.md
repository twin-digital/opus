---
---

chore: drop the obsolete `ink` pnpm patch. The patch removed a trailing newline from ink's `log-update.js`, which ink 6.8.0 rewrote to no longer append — so the fix is upstream and the patch already failed to apply (a benign install WARN; ink ran unpatched regardless). Removing it clears the dead patch + warning and empties `patchedDependencies`; repo-kit sync sets the Renovate `patched-deps` rule's `matchPackageNames` to `[]` (inert — an empty match list matches nothing), and it self-repopulates if a patch is ever added back.
