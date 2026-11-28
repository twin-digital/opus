# Spec Delta

## ADDED Requirements

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
