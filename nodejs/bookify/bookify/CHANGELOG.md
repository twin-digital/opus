# @twin-digital/bookify

## 0.2.0

### Minor Changes

- 1a694f5: significant improvements to watch behavior
  - switched from native watcher to chokidar
  - added glob support for all inputs
  - correctly rebuild when implicit dependencies change (css @imports, url(...) references, etc.)

## 0.1.1

### Patch Changes

- f8705dc: resolve paths relative to a project file if using one

## 0.1.0

### Minor Changes

- 8401a71: bookify: replace loose render functions with a unified engine
  - operates on a project model
  - handles 'watch' functionality internally
  - normalizes configuration of options for renderers via env variables
  - update CLI to use new API

  BREAKING: all previous commands removed from CLI, and replaced with 'html' and 'pdf'

- 8401a71: introduce configuration model

### Patch Changes

- 8401a71: add support for reusing CSS published as 'style pack' packages to npm

## 0.0.2

### Patch Changes

- 644c2fb: make package publishable

## 0.0.1

### Patch Changes

- a163e66: initial creation of project
