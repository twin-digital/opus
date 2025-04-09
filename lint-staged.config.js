/**
 * @filename: lint-staged.config.js
 * @type {import('lint-staged').Configuration}
 */
export default {
  '*.{ts,tsx,js,jsx}': ['prettier --write', 'eslint --fix'],
  '*.{json,md,yml,yaml}': ['prettier --write'],
  '*.{spec,test}.{ts,js}': 'vitest --run --passWithNoTests',
}
