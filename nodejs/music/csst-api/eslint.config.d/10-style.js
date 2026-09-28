import jsdoc from 'eslint-plugin-jsdoc'

/**
 * Doc comments span multiple lines, and functions are arrow functions. Class methods, accessors and
 * generators, which have no arrow form, are exempt.
 */
export default [
  {
    files: ['**/*.{js,ts}'],
    plugins: { jsdoc },
    rules: {
      'jsdoc/multiline-blocks': ['error', { noSingleLineBlocks: true }],
      'func-style': ['error', 'expression'],
      'prefer-arrow-callback': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'FunctionExpression:not([generator=true]):not(MethodDefinition > FunctionExpression):not(Property[kind="get"] > FunctionExpression):not(Property[kind="set"] > FunctionExpression)',
          message: 'Use an arrow function.',
        },
      ],
    },
  },
]
