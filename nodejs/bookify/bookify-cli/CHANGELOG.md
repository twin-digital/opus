# @twin-digital/bookify-cli

## 0.2.0

### Minor Changes

- 8401a71: add support for reusing CSS published as 'style pack' packages to npm
- 8401a71: bookify: replace loose render functions with a unified engine
  - operates on a project model
  - handles 'watch' functionality internally
  - normalizes configuration of options for renderers via env variables
  - update CLI to use new API

  BREAKING: all previous commands removed from CLI, and replaced with 'html' and 'pdf'

### Patch Changes

- 8401a71: 'pdf' and 'html' commands automatically create output directories if needed
- 8401a71: add '--project' argument to html and pdf commands
- Updated dependencies [8401a71]
- Updated dependencies [8401a71]
- Updated dependencies [8401a71]
  - @twin-digital/bookify@0.1.0

## 0.1.1

### Patch Changes

- 644c2fb: make package publishable
- Updated dependencies [644c2fb]
  - @twin-digital/bookify@0.0.2

## 0.1.0

### Minor Changes

- a163e66: add initial commands:
  - assemble: assembles loose content sections into a single markdown fil
  - transform: assembles markdown input files and transforms them to a single HTML file with assets embedded
  - render: transforms a standalone HTML file (with embedded styles) into a PDF

### Patch Changes

- a163e66: initial creation of project
- Updated dependencies [a163e66]
  - @twin-digital/bookify@0.0.1
