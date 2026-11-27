// Composed onto the shared base by the generated eslint.config.js (eslint.config.d/*.js).
// The root entry runs in a web browser. Only the generator and the tests use Node.js modules.
export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/view-types.ts', 'src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['node:*'], message: 'The root entry must use no Node.js module.' }] },
      ],
    },
  },
]
