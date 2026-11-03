# reaper-sim Specification

## Purpose

`@thrashplay/reaper-sim` is an in-memory REAPER for tests and development. It hosts the real
ReaScript Lua of the CS Studio watcher and its commands against a model of REAPER's state, and
serves the web remote's ext-state commands, so the client and watcher are tested end to end without
REAPER. Its `probe/` checks every modeled behavior against a running REAPER. The REAPER behaviors the
simulator models are listed in its README as Confirmed or Assumed; that list is the only record of
them.

## Requirements

### Requirement: Scripts run as in REAPER

The simulator SHALL host Lua 5.4 scripts, each in its own Lua state, with their directory mounted
so they can load sibling files, and SHALL run every deferred function once per tick, either on
demand or on a timer at about 30 Hz.

#### Scenario: A watcher script ticks

- **WHEN** a script that calls `reaper.defer` is loaded and the simulator ticks
- **THEN** the deferred function runs once per tick, and a script that throws is stopped and holds
  its error while other scripts keep running

#### Scenario: Script end

- **WHEN** a script ends, is stopped, or the simulator closes
- **THEN** its `atexit` functions run, except when the script died of an error

### Requirement: The model is data, not behavior

The simulator SHALL model REAPER state as inert records: projects and tabs, project and global ext
state, tracks with their record settings, MIDI input devices, and undo points. Calls with side
effects outside the model (saving, rendering, transport) SHALL be journaled no-ops. The simulator
SHALL NOT model audio or MIDI signal, nor recording producing items.

#### Scenario: Unmodeled function

- **WHEN** a script calls a ReaScript function the simulator does not implement
- **THEN** the call is a Lua error, not a silent default

#### Scenario: Journaled side effect

- **WHEN** a script saves the project
- **THEN** nothing is written, and the call appears in the simulator's journal for a test to assert

### Requirement: Ext state behaves as REAPER's

The simulator SHALL store ext-state sections and keys upper-cased and find them in any case,
enumerate project keys sorted, treat an empty value as deleting a project key but keeping a global
key, and keep project ext state per project.

#### Scenario: Mixed-case write and read

- **WHEN** a key is written as `Probe_Key` and read as `PROBE_KEY` or `probe_key`
- **THEN** the same value is returned, and enumeration lists it upper-cased

### Requirement: The web remote is served

The simulator SHALL answer web remote requests (`/_/<cmd>;<cmd>`) for `GET` and `SET` of project
and global ext state, in process or over HTTP, with REAPER's reply format and limits: each command
cut at 1023 characters, `SET` decoding percent-escapes in the section and key, `GET` looking the key
up as spelled, replies as tab-separated lines with tabs, newlines and backslashes escaped, and no
reply while a script's tick is running.

#### Scenario: Cut-off command

- **WHEN** a `SET` command longer than 1023 characters is sent
- **THEN** the value stored is the command as cut at 1023 characters, and the request succeeds

#### Scenario: Request during a tick

- **WHEN** a request arrives while a script's tick is running
- **THEN** it is answered after the tick ends

### Requirement: The probe checks the simulator against REAPER

The package SHALL ship a probe in two halves, a Lua script run inside REAPER and a Node script run
from any machine that reaches the web remote, that checks every behavior the simulator models and
prints PASS or FAIL per check, and records behaviors it only observes as INFO. The probe SHALL pass
against the simulator itself.

#### Scenario: A modeled behavior differs on REAPER

- **WHEN** the probe runs against REAPER and a modeled behavior differs
- **THEN** the check prints FAIL with what REAPER did and what the simulator models

#### Scenario: Promotion to Confirmed

- **WHEN** a probe run passes a check for a behavior listed as Assumed in the README
- **THEN** the README moves it to Confirmed with the date of that run
