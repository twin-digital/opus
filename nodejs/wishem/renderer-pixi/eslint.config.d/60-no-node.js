// Composed onto the shared base by the generated eslint.config.js (eslint.config.d/*.js).
// The renderer runs in a web browser, so a source file cannot import a Node.js module.

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:*'], message: 'The renderer runs in a web browser. Do not import a Node.js module.' },
          ],
        },
      ],
    },
  },
]
