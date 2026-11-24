// Composed onto the shared base by the generated eslint.config.js (eslint.config.d/*.js).
const message = 'The core runs in a web browser. Do not import a Node.js API.'

export default [
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['node:*'], message }] }],
    },
  },
]
