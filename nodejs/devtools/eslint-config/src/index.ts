import jsLint from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
import tsLint from 'typescript-eslint'
import globals from 'globals'

const IgnoredRulesInTests = [
  '@typescript-eslint/no-explicit-any',
  '@typescript-eslint/no-unsafe-argument',
  '@typescript-eslint/no-unsafe-assignment',
  '@typescript-eslint/no-unused-vars',
]

const config: ReturnType<(typeof tsLint)['config']> = tsLint.config(
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,jsx,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            'eslint.config.js',
            'scripts/*.js',
            'scripts/*.ts',
          ],
        },
      },
    },
  },
  jsLint.configs.recommended,
  tsLint.configs.strictTypeChecked,
  tsLint.configs.stylisticTypeChecked,
  eslintConfigPrettier,
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,jsx,tsx}'],
    rules: {
      // change this rule from "strict" settings to "recommended"
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allow: [{ name: ['Error', 'URL', 'URLSearchParams'], from: 'lib' }],
          allowAny: true,
          allowBoolean: true,
          allowNullish: true,
          allowNumber: true,
          allowRegExp: true,
        },
      ],
      // allow suppressing this with a "_" prefix
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: ['**/*.{spec,test}.{js,mjs,cjs,ts,mts,jsx,tsx}'],
    rules: IgnoredRulesInTests.reduce(
      (result, rule) => ({
        ...result,
        [rule]: 'off',
      }),
      {},
    ),
  },
  {
    ignores: ['dist', 'node_modules', '**/node_modules'],
  },
)

export default config
