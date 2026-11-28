# Spec Delta

## MODIFIED Requirements

### Requirement: The clock package runs with no Node.js API

The code of the package SHALL use the standard library of the language and the timer functions that Node.js and a web browser both give. It SHALL NOT use an API that only one of them gives. A package with no Node.js types that reads the source of the clock through the `source` condition SHALL pass its type check.

#### Scenario: A source file imports a Node.js module

- **WHEN** a source file of the package imports `node:timers`
- **THEN** the build of the package fails

#### Scenario: A package with no Node.js types imports the clock

- **WHEN** a package whose type check has no Node.js types imports `startClock` through the `source` condition
- **THEN** its type check passes, with no error for `setInterval` or `clearInterval`

## ADDED Requirements

### Requirement: The clock measures the real time from the start of the hub

When the clock gets the `started` event of the hub, it SHALL measure the real time again from that event. The real time that passed before the hub started SHALL NOT cause ticks after the start.

#### Scenario: A clock that starts before the hub

- **WHEN** the step length is 100 milliseconds, the clock starts, 600 milliseconds of real time pass, the hub starts, and the timer is called 20 milliseconds after the start of the hub
- **THEN** that call sends no tick, and a call 100 milliseconds after the start of the hub sends one tick

#### Scenario: A clock that starts after the hub

- **WHEN** the hub runs, and then the clock starts with a step length of 100 milliseconds
- **THEN** the clock measures the real time from its own start, and a call 100 milliseconds later sends one tick
