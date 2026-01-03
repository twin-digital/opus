import jsLint from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
import tsLint from 'typescript-eslint'
import globals from 'globals'
import { defineConfig } from 'eslint/config'

const DisabledRules = [
  // enabled in tsLint.configs.stylisticTypeChecked, but conflicts with rules from tsLint.configs.strictTypeChecked
  '@typescript-eslint/non-nullable-type-assertion-style',
]

const DisabledRulesInTests = [
  '@typescript-eslint/no-explicit-any',
  '@typescript-eslint/no-non-null-assertion',
  '@typescript-eslint/no-unsafe-argument',
  '@typescript-eslint/no-unsafe-assignment',
  '@typescript-eslint/no-unused-vars',
  '@typescript-eslint/unbound-method',
]

const config: ReturnType<(typeof tsLint)['config']> = defineConfig(
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,jsx,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
      },
    },
  },
  jsLint.configs.recommended,
  tsLint.configs.strictTypeChecked,
  tsLint.configs.stylisticTypeChecked,
  eslintConfigPrettier,
  {
    // customize rules from our presets with new settings
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
    // add custom rules not in our presets
    files: ['**/*.{js,mjs,cjs,ts,mts,jsx,tsx}'],
    rules: {
      // Require curly braces around all blocks (if, else, for, while, etc.)
      curly: ['error', 'all'],
    },
  },
  {
    // turn off preset rules we don't want
    files: ['**/*.{js,mjs,cjs,ts,mts,jsx,tsx}'],
    rules: DisabledRules.reduce(
      (result, rule) => ({
        ...result,
        [rule]: 'off',
      }),
      {},
    ),
  },
  {
    // turn off specific rules for test files
    files: ['**/*.{spec,test}.{js,mjs,cjs,ts,mts,jsx,tsx}'],
    rules: DisabledRulesInTests.reduce(
      (result, rule) => ({
        ...result,
        [rule]: 'off',
      }),
      {},
    ),
  },
  {
    ignores: ['dist', 'node_modules', '**/node_modules', '**/CHANGELOG.md'],
  },
)

export default config
