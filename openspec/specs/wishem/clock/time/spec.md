# wishem/clock/time Specification

## Purpose

Defines the time of a construct: the part of the joined state that holds it, the tick that advances it, the inputs that pause and resume it, and the clock that sends ticks at normal speed. A construct that has no need for time includes none of these parts.

## Requirements

### Requirement: The time subsystem holds the time of a construct

The time subsystem SHALL be a model subsystem with the ID `time`. Its part of the joined state SHALL hold the time of the construct in milliseconds, the count of ticks, and a `running` value. A new part SHALL have the time 0 and the count 0. The code that makes the subsystem SHALL select the first `running` value, and the default SHALL be `true`.

#### Scenario: A new construct

- **WHEN** a hub is made with the time subsystem and no option
- **THEN** the part `time` has the time 0, the count of ticks 0, and `running` is `true`

#### Scenario: A construct that starts in a pause

- **WHEN** the time subsystem is made with `running` set to `false`
- **THEN** the part `time` has `running` set to `false`

### Requirement: A tick advances the time

A tick SHALL be one input of the type `time/advance` that holds a length in milliseconds. The time subsystem SHALL add the length to the time of the construct and SHALL add 1 to the count of ticks. It SHALL apply a tick for each value of `running`. It SHALL refuse a length that is not a finite number larger than 0.

#### Scenario: Three ticks

- **WHEN** the time subsystem gets three ticks of 50 milliseconds
- **THEN** the time of the construct is 150, and the count of ticks is 3

#### Scenario: A step during a pause

- **WHEN** `running` is `false` and a controller sends one tick of 50 milliseconds
- **THEN** the time of the construct advances by 50, and `running` stays `false`

#### Scenario: A length that is not correct

- **WHEN** the time subsystem gets a tick with the length 0, a negative length, or a length that is not a number
- **THEN** it refuses the input, and the part does not change

### Requirement: An input pauses and resumes the construct

The input `time/set-running` SHALL hold a `running` value that is `true` or `false`. The time subsystem SHALL put that value in its part. When the value is equal to the current value, the part SHALL stay the same object. The subsystem SHALL refuse a value that is not `true` or `false`.

#### Scenario: A pause

- **WHEN** `running` is `true` and the time subsystem gets `time/set-running` with `false`
- **THEN** `running` is `false`, and the time and the count of ticks do not change

#### Scenario: The same value

- **WHEN** `running` is `true` and the time subsystem gets `time/set-running` with `true`
- **THEN** the part is the same object as before

### Requirement: The clock sends ticks at normal speed while the construct runs

The clock SHALL be an input subsystem. While it is started and `running` is `true`, it SHALL send one tick of the step length for each step length of real time that passes. The default step length SHALL be 50 milliseconds, and the code that starts the clock SHALL be able to select a different length. Each tick of the clock SHALL have the same length.

#### Scenario: One second of real time

- **WHEN** a clock with a step length of 50 milliseconds runs for 1000 milliseconds of real time
- **THEN** the time of the construct is 1000, and the count of ticks is 20

#### Scenario: A different step length

- **WHEN** a clock is started with a step length of 100 milliseconds and runs for 1000 milliseconds of real time
- **THEN** the count of ticks is 10

### Requirement: The clock sends no tick during a pause

While `running` is `false`, the clock SHALL send no tick. The real time that passes during a pause SHALL NOT cause ticks after the pause ends.

#### Scenario: A pause of ten seconds

- **WHEN** `running` becomes `false`, ten seconds of real time pass, and `running` becomes `true`
- **THEN** the clock sent no tick during the pause, and it sends the next tick one step length after the pause ends

### Requirement: The clock limits the ticks that it sends after a delay

When the timer of the clock is late, the clock SHALL send the ticks that are due, up to a limit for one call of the timer. The default limit SHALL be 5. The clock SHALL drop the time above the limit.

#### Scenario: A short delay

- **WHEN** the step length is 50 milliseconds and the timer is called 150 milliseconds after the last tick
- **THEN** the clock sends three ticks

#### Scenario: A long delay

- **WHEN** the step length is 50 milliseconds and the timer is called 10 seconds after the last tick
- **THEN** the clock sends five ticks, and the next call of the timer one step length later sends one tick

### Requirement: The clock stops with the construct

The clock SHALL send no tick after the code that started it stops it, and no tick after the hub sends the `stopping` event. A stopped clock SHALL release its timer. A second stop SHALL do nothing.

#### Scenario: The hub stops

- **WHEN** a clock runs and the hub stops
- **THEN** the clock releases its timer and sends no more input

### Requirement: A controller can advance a construct with no clock

A construct that has the time subsystem and no clock SHALL advance only when an input subsystem sends a tick. The result of a list of ticks SHALL NOT depend on the real time at which they arrive.

#### Scenario: Faster than real time

- **WHEN** a controller sends 1000 ticks of 50 milliseconds with no wait between them
- **THEN** the time of the construct is 50000, and the count of ticks is 1000

### Requirement: The clock package runs with no Node.js API

The code of the package SHALL use the standard library of the language and the timer functions that Node.js and a web browser both give. It SHALL NOT use an API that only one of them gives. A package with no Node.js types that reads the source of the clock through the `source` condition SHALL pass its type check.

#### Scenario: A source file imports a Node.js module

- **WHEN** a source file of the package imports `node:timers`
- **THEN** the build of the package fails

#### Scenario: A package with no Node.js types imports the clock

- **WHEN** a package whose type check has no Node.js types imports `startClock` through the `source` condition
- **THEN** its type check passes, with no error for `setInterval` or `clearInterval`

### Requirement: The clock sends no late ticks after a rewind

After the hub applies a rewind, the clock SHALL measure the real time again from the time of the rewind. The real time that passed before the rewind SHALL NOT cause ticks after it. While `running` is `true` after the rewind, the clock SHALL send the next tick at the first call of its timer that is one step length or more after the rewind.

#### Scenario: A rewind while the construct runs

- **WHEN** the step length is 50 milliseconds, the hub applies a rewind 120 milliseconds after the last tick, and the timer is called 20 milliseconds after the rewind
- **THEN** that call sends no tick, and a call 50 milliseconds after the rewind sends one tick

#### Scenario: A rewind to a pause

- **WHEN** `running` is `true`, and a rewind returns to a point at which `running` is `false`
- **THEN** the clock sends no tick until `running` becomes `true`

### Requirement: The clock measures the real time from the start of the hub

When the clock gets the `started` event of the hub, it SHALL measure the real time again from that event. The real time that passed before the hub started SHALL NOT cause ticks after the start.

#### Scenario: A clock that starts before the hub

- **WHEN** the step length is 100 milliseconds, the clock starts, 600 milliseconds of real time pass, the hub starts, and the timer is called 20 milliseconds after the start of the hub
- **THEN** that call sends no tick, and a call 100 milliseconds after the start of the hub sends one tick

#### Scenario: A clock that starts after the hub

- **WHEN** the hub runs, and then the clock starts with a step length of 100 milliseconds
- **THEN** the clock measures the real time from its own start, and a call 100 milliseconds later sends one tick

### Requirement: The part time can hold the step length

The code that makes the time subsystem SHALL be able to give a step length in milliseconds. With a step length, the first part `time` SHALL hold it as `stepMs`, and each later part SHALL keep the same `stepMs`. With no step length, the part SHALL have no `stepMs`. The code SHALL throw an error for a step length that is not a finite number larger than 0.

#### Scenario: A step length of 500 milliseconds

- **WHEN** the time subsystem is made with the step length 500, and it gets three ticks of 500 milliseconds and a pause
- **THEN** the part `time` has the time 1500, the count of ticks 3, `running` set to `false`, and `stepMs` 500

#### Scenario: No step length

- **WHEN** the time subsystem is made with no option
- **THEN** the part `time` is `{ now: 0, ticks: 0, running: true }`, with no key `stepMs`

#### Scenario: A rewind keeps the step length

- **WHEN** a hub with the time subsystem made with the step length 50 accepts five ticks and rewinds to the input 2
- **THEN** the part `time` has the count of ticks 2 and `stepMs` 50

#### Scenario: A step length that is not correct

- **WHEN** the time subsystem is made with the step length 0, a negative step length, or a step length that is not a number
- **THEN** the code throws an error that names the step length
