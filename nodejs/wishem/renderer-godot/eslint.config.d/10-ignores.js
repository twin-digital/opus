// Composed onto the shared base by the generated eslint.config.js (eslint.config.d/*.js).
// The files of docker/ run in the image, outside the TypeScript project.

/** @type {import('eslint').Linter.Config[]} */
export default [{ ignores: ['docker', 'godot', 'shots', '.out'] }]
