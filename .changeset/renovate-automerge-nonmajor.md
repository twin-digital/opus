---
---

ci: auto-merge non-major (minor/patch/pin/digest) dependency updates once all required checks pass (CI build/lint/test, merge-checks, the Socket supply-chain scanner, changeset-present). Majors are excluded and always get a human; build-script (`onlyBuiltDependencies`) bumps stay manual; patched-dependency bumps self-gate on CI (a broken patch fails the relock) rather than being force-held. Security updates continue to auto-merge via `vulnerabilityAlerts`.
