---
'@twin-digital/repo-kit': patch
---

The `repo-kit` bin is now a small launcher that runs from TypeScript source when the package's `src` is present (in a checkout of this repo) and from the compiled `dist` when installed as a published package. Commands are also registered from an explicit list rather than a runtime scan of the `commands/` directory, so resolution is identical from source or `dist`. The published CLI behaves exactly as before.
