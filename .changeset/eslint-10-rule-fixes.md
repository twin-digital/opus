---
'@twin-digital/bookify': patch
'@twin-digital/renovate-tools': patch
---

chore: satisfy new `eslint:recommended` rules introduced in ESLint v10. The pandoc/WeasyPrint "not installed" errors now attach the underlying spawn failure as `cause` (`preserve-caught-error`), and a redundant `let isDir = false` initializer in the workspace walker was dropped (`no-useless-assignment`).
