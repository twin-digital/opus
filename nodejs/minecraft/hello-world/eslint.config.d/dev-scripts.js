// deploy.mjs (Docker-orchestration dev script) and build-pack.mjs (build-time
// manifest assembly) are `.mjs` harness scripts outside the TS program, so the
// type-aware lint's project service can't parse them; keep them out of lint.
export default [{ ignores: ['deploy.mjs', 'build-pack.mjs'] }]
