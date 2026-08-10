// The release-bundle script reads a package manifest and the workspace's YAML,
// both of which arrive untyped however they are annotated: `JSON.parse` and
// `yaml`'s `parse` are `any` at the boundary, and a build script is where that
// belongs. It ships nothing — the daemon's own source is held to the base
// config.
export default [
  {
    files: ['scripts/**/*.js'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },
]
