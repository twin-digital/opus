// deploy.mjs is a Docker-orchestration dev script (build → cp into the dev
// container → /reload), not shipped pack code — the same kind of harness script
// as dev-bedrock-server/build-activation.mjs. It's a `.mjs` outside the TS
// program, so the type-aware lint's project service can't parse it; keep it out
// of lint rather than force it into the typed build.
export default [{ ignores: ['deploy.mjs'] }]
