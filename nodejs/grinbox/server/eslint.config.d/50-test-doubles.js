// Composed onto the shared base by the generated eslint.config.js (eslint.config.d/*.js).
//
// The daemon's seams are asynchronous — the provider, the mail and model
// transports, the OAuth client, the metered resource clients — so a test double
// standing in for one must return a promise whether or not it awaits anything,
// and a double for a fire-and-forget hook is legitimately empty. Both rules
// would be answered by writing `Promise.resolve(...)` and `() => undefined`
// throughout the doubles, which says nothing the interface does not already say.
//
// Scoped to test files and the shared fixtures they build on. Production code is
// held to the base config.
const testFiles = [
  'src/**/*.test.ts',
  'src/**/test-support.ts',
  'src/**/test-helpers.ts',
  'src/operators/testing.ts',
]

export default [
  {
    files: testFiles,
    rules: {
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
]
