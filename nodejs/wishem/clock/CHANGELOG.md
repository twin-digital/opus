# @thrashplay/wishem-clock

## 0.1.0

### Minor Changes

- 421d784: The part `time` can hold the step length of the clock. `createTime` takes the option `stepMs`.
- 73432e7: New package: the time of a construct. `createTime` makes the time subsystem, and `startClock` sends ticks at normal speed while the construct runs.

### Patch Changes

- 139b3cd: A package that has no Node.js types can import the source of the clock.
- 139b3cd: The clock measures the real time from the start of the hub, so a clock that starts before the hub sends no late ticks.
- 58e0189: A test proves that a package with no Node.js types can import the clock.
- 2562f8e: Test the lower limit of the step length of the part `time`.
- fcf369e: The tests of the default source of real time of the clock are stronger. The package has no change of behavior.
- bdbc697: The clock uses `performance.now()`, not `Date.now`, as its default source of real time.
- 86b2e37: The clock sends no late ticks after a rewind: it measures the real time again from the time of the rewind.
- Updated dependencies [5ea9a44]
- Updated dependencies [d823333]
- Updated dependencies [ced6862]
- Updated dependencies [d107430]
- Updated dependencies [ea8b458]
- Updated dependencies [ea8b458]
- Updated dependencies [ea8b458]
- Updated dependencies [ea8b458]
- Updated dependencies [b36bb42]
- Updated dependencies [68b689d]
- Updated dependencies [3adc5a1]
- Updated dependencies [64efce8]
- Updated dependencies [a6b3ba2]
- Updated dependencies [96c1755]
- Updated dependencies [b19239f]
- Updated dependencies [52d739c]
- Updated dependencies [b7d80d7]
- Updated dependencies [24b02f3]
- Updated dependencies [cbbd4e9]
- Updated dependencies [24fbcff]
- Updated dependencies [3197928]
- Updated dependencies [86b2e37]
- Updated dependencies [86b2e37]
- Updated dependencies [86b2e37]
- Updated dependencies [86b2e37]
- Updated dependencies [86b2e37]
- Updated dependencies [b655a01]
  - @thrashplay/wishem-hub@0.1.0
