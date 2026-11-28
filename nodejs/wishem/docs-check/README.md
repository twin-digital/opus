# @thrashplay/wishem-docs-check

Tests that the architecture document of Wishem agrees with the packages.

The tests run `nodejs/wishem/docs/architecture/render.mjs --check`. The check fails when a generated SVG file is out of date, when a package has no layer, or when the table of the packages has no row for a package.

The package has each other package of `nodejs/wishem/` as a development dependency. A change to any of them makes CI run these tests.

## Exports

- `renderScript`: the absolute path of `render.mjs`.
- `architectureFolder`: the absolute path of the folder of the architecture document.
