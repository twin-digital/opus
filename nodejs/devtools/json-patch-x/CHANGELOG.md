# @twin-digital/json-patch-x

## 0.3.0

### Minor Changes

- 4858d9f: Add a `setMatching` extended operation: select array element(s) by a value predicate (`contains`/`equals` against a field pointer) and set a child pointer within each match. This addresses array elements by value rather than by index — the gap left by RFC 6901 JSON Pointers — so selection is stable across reordering. Also exports `tryGetValueByPointer` from the package entry point, and bootstraps the package's first vitest test suite.

## 0.2.0

### Minor Changes

- c6c2536: add 'reorderMapKeys' operation

  This allows the keys of a JSON map to be explicitly ordered.

## 0.1.0

### Minor Changes

- 22f58e3: update to nodejs v24.x and Typescript 5.9

## 0.0.1

### Patch Changes

- f361b78: initial version of package
- f830568: add "appendIfMissing" extended operation
