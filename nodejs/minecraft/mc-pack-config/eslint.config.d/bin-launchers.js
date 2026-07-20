// bin/ holds thin committed launchers for dist/ entries (linked by pnpm at
// install time, before a build exists). They're plain JS outside the TS
// project, so the type-aware lint's project service can't parse them.
export default [{ ignores: ['bin/**'] }]
