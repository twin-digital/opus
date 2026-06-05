---
'@twin-digital/repo-kit': patch
---

Register CLI commands from an explicit list instead of scanning the `commands/` directory at runtime. The compiled bin behaves exactly as before, and the CLI now resolves its commands identically whether it runs from `dist` or directly from TypeScript source — removing a divergence where the directory scan filtered on file extension.
