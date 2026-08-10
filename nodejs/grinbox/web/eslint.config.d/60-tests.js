// Composed onto the shared base by the generated eslint.config.js (eslint.config.d/*.js).
//
// The shared config already turns off the `any`-family rules in test files, but its list
// predates a component suite: `vi.fn()` and RTL fixtures are `any` by construction, so the
// remaining "unsafe" rules fire on ordinary mock plumbing rather than on a real type hole.
// `require-await` fires on the async fixture factories a mocked `fetch` needs, and
// `no-empty-function` on the jsdom shims (`scrollIntoView`, ResizeObserver) that exist
// precisely to do nothing.
/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    files: ['src/**/*.{spec,test}.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
]
