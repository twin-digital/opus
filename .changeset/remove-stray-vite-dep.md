---
'@twin-digital/bookify-render-api': patch
---

chore(deps): drop the explicit `vite` devDependency from bookify-render-api. Vite is a peer of vitest and is auto-installed by pnpm (as it already is for every other vitest-using package), so the manual declaration was redundant. This also retires the standalone Renovate update for it.
