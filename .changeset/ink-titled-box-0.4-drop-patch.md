---
'@twin-digital/refbash': patch
---

fix(deps): update `@mishieck/ink-titled-box` to `^0.4.0` and drop the obsolete local patch. The patch (pinned to `0.3.0`) backported two React hook-dependency fixes that upstream now ships in 0.4.x, so it is removed rather than re-rolled. ink-titled-box consequently leaves the Renovate `patched-deps` isolation rule (synced by repo-kit). Supersedes #139, which couldn't reconcile the version-pinned patch on a bump.
