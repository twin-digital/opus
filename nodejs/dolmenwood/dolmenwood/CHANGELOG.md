# @twin-digital/dolmenwood

## 0.3.0

### Minor Changes

- b78823f: introduce 'encounter' model
  - tracks awareness, surprise, initiative, and encounter distance
  - provides state machine flow for configuring encounter situation
  - automatically fills in details where possible

- 22f58e3: update to nodejs v24.x and Typescript 5.9
- 22f58e3: introduce 'chronicle' apis
- b78823f: add mobx observability to all models

  We were applying this indirectly in the store layer. However, this was introducing various bugs where models were not
  observable when expected. While this adds the mobx dependency to our model, it greatly increases reliability in the UI.

### Patch Changes

- 22f58e3: move core Dolmenwood model into new @twin-digital/dolmenwood package
  - create new package
  - move relevant code from 'codex'
  - update dependencies in refbash

- b78823f: add d6 check utilities
- 22f58e3: implement date library functions
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
