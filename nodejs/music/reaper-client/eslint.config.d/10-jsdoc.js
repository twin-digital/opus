import jsdoc from 'eslint-plugin-jsdoc'

/**
 * Doc comments always span multiple lines.
 */
export default [
  {
    files: ['**/*.{js,ts}'],
    plugins: { jsdoc },
    rules: {
      'jsdoc/multiline-blocks': ['error', { noSingleLineBlocks: true }],
    },
  },
]
