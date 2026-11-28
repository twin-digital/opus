// Composed onto the shared base by the generated eslint.config.js (eslint.config.d/*.js).
// The shared config lints .tsx but knows nothing about React; this adds the hooks rules.
import reactHooks from 'eslint-plugin-react-hooks'

// The plugin's own types do not match the `Plugin` shape of eslint 10, so the export is asserted.
const plugin = /** @type {import('eslint').ESLint.Plugin} */ (/** @type {unknown} */ (reactHooks))

/** @type {import('eslint').Linter.Config[]} */
const config = [
  { ignores: ['dist'] },
  {
    files: ['{src,views}/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': plugin },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
]

export default config
