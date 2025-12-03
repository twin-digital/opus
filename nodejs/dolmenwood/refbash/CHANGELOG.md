# @twin-digital/refbash

## 0.1.0

### Minor Changes

- b78823f: implement "Encounter" panel
  - Wizard-like flow for resolving start-of-encounter steps
  - Only asks relevant questions and infers results when possible
  - Determines encounter distance, surprise, and encounter initiative

- 22f58e3: implement common 3-section layout for all modes
- 22f58e3: implement light source tracking during delves
  - Each light source shows who is carrying it, type, and remaining turns
  - As time advances, light durations automatically decrement
  - Lights are highlighted when they near expiration (yellow) or have expired (red)
  - EventLog entries are created when a light goes out
  - Lights can be added via simple form, or removed

- b78823f: revamp input system to support layering
- b78823f: introduce new footer content pattern

  This will allow deeply nested components to "take control" of the footer and
  render contextual content, such as forms, into it.

- 22f58e3: rename project from 'refbash'
- 22f58e3: update to nodejs v24.x and Typescript 5.9
- 22f58e3: integrate mobx for observability and persistence

### Patch Changes

- 22f58e3: move core Dolmenwood model into new @twin-digital/dolmenwood package
  - create new package
  - move relevant code from 'codex'
  - update dependencies in refbash

- b78823f: do not advance turn if user enters 't' in form field
- b78823f: update CompactTable component to support row selection
- b78823f: update compact-table to support per-row styling
- 8d56808: create initial project skeleton
- b78823f: support nested model classes in abstract store

  Previously, nested class instances would not be made 'observable', preventing reactive
  updates when nested data changed. The new `_initializeObservable` implementation
  recursively traverses the object graph, making deep observables.

- b78823f: update warning colors to be more distinct from Autumn Orange
- b78823f: add support for wandering monsters to delve automation
  - Delve configuration includes check frequency and wandering monster chance
  - As time advances, wandering monster checks are automatically performed based on the configuration
  - Pressing 'w' will perform an ad-hoc wandering monster check in the current turn
  - If the check indicates a wandering monster appears, an encounter is created in the turn

- b78823f: enhance display of event log
  - prefix with in-game time
  - correctly update panel when log contents change
  - support 'rewinding' the time and clearing later log entries
  - allow selection of log entries, to facilitate viewing logs longer than screen height

- b78823f: implement log panel scrolling
- b78823f: add 'selected' colors to theme
- Updated dependencies [22f58e3]
- Updated dependencies [b78823f]
- Updated dependencies [b78823f]
- Updated dependencies [22f58e3]
- Updated dependencies [22f58e3]
- Updated dependencies [22f58e3]
- Updated dependencies [b78823f]
- Updated dependencies [b78823f]
- Updated dependencies [b78823f]
  - @twin-digital/dolmenwood@0.3.0
