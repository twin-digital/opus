---
---

chore: drop four redundant type assertions flagged by the bumped `typescript-eslint` (`repo-kit` ×2, `codex`, `refbash`). All were already unnecessary — the older rule simply didn't catch them — so removing them is safe on current `main` and unblocks the all-non-major batch (#127) once it rebases. Test/internal only, no published behavior change.
