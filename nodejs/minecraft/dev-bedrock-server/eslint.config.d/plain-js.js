// The harness is plain-JS scripts with no tsconfig — turn off the type-aware
// rules (and the project service) that assume a TS project.
import tseslint from 'typescript-eslint'

export default [{ files: ['**/*.mjs', '**/*.js'], ...tseslint.configs.disableTypeChecked }]
