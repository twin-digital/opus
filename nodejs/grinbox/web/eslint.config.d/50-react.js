// Composed onto the shared base by the generated eslint.config.js (eslint.config.d/*.js).
// The shared config lints .tsx but knows nothing about React; this adds the hooks rules,
// which are the ones that catch real bugs rather than style.
import reactHooks from 'eslint-plugin-react-hooks'

// The plugin's own types have not caught up with eslint 10's `Plugin` shape, so the export
// is asserted rather than inferred. The annotation on `default` is what keeps the emitted
// declaration portable — inference here reaches into @types/estree.
const plugin = /** @type {import('eslint').ESLint.Plugin} */ (/** @type {unknown} */ (reactHooks))

/** @type {import('eslint').Linter.Config[]} */
export default [
  { ignores: ['dist'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': plugin },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
]
