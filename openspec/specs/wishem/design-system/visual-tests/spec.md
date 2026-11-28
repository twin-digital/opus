# wishem/design-system/visual-tests Specification

## Purpose

Defines the tests that protect the look of the Wishem workbench: the screenshot tests and the accessibility tests of the style guide, and the pinned web browser that gives the same result on each computer.

## Requirements

### Requirement: Screenshot tests of the style guide

A test SHALL take a screenshot of each section of the style guide in light mode and in dark mode, and compare it with a baseline image. The baseline images SHALL be files in the repository. The test SHALL fail when a screenshot is different from its baseline.

#### Scenario: Nothing changed

- **WHEN** the tests run and no source file of the style guide changed after the baselines were made
- **THEN** each screenshot agrees with its baseline and the tests pass

#### Scenario: The look of a component changed

- **WHEN** a person changes the height of the app bar and runs the tests
- **THEN** the test of the components section fails for each theme and gives an image of the difference

### Requirement: Accessibility tests of the style guide

A test SHALL run an automated accessibility check on each section of the style guide in light mode and in dark mode. The test SHALL fail when the check reports a violation.

#### Scenario: Text with low contrast

- **WHEN** a component shows text with a contrast ratio of less than 4.5 on its background, and the tests run
- **THEN** the accessibility test of the components section fails and names the element

### Requirement: The web browser is pinned

The web browser of the tests SHALL run in one container image with a pinned version. The version of the image SHALL agree with the version of the test tool in the repository. The tests SHALL NOT run in a different web browser.

#### Scenario: The version of the test tool changes

- **WHEN** a person changes the version of the test tool in the repository and starts the tests
- **THEN** the browser container starts from the image that has the new version, and no other file was changed

#### Scenario: The browser container does not run

- **WHEN** a person starts the tests and the browser container cannot start
- **THEN** the command stops with a message that says what to do, and no baseline is changed

### Requirement: The same result on each computer

A baseline that passes on a development computer SHALL pass in the pull request checks, and a baseline that passes in the pull request checks SHALL pass on a development computer.

#### Scenario: A baseline from a development computer

- **WHEN** a person makes the baselines on a development computer and pushes them with no other change
- **THEN** the screenshot tests pass in the pull request checks

### Requirement: The tests use no font from the network

The typefaces of the workbench SHALL be files of the package. A page of the workbench SHALL NOT request a font from a different host.

#### Scenario: The requests of the style guide

- **WHEN** the tests load the style guide and record each request
- **THEN** each request goes to the server of the package

### Requirement: A command updates the baselines

One command SHALL make the baseline images again in the pinned web browser. The command SHALL change only the baselines of the screenshots that are different.

#### Scenario: Update after an intended change

- **WHEN** a person changes the height of the app bar, runs the command, and runs the tests again
- **THEN** the baselines of the components section are new files, the other baselines are the same, and the tests pass

### Requirement: The pull request checks run the tests

A job of the pull request checks SHALL run the screenshot tests and the accessibility tests when a change affects the package of the workbench application. A failure of a test SHALL fail the job. On a failure, the job SHALL keep the screenshots and the images of the differences so that a person can get them.

#### Scenario: A pull request that changes a component

- **WHEN** a pull request changes the app bar and does not update the baselines
- **THEN** the job fails, and the images of the differences are available from the run

#### Scenario: A pull request that does not touch the package

- **WHEN** a pull request changes only a different package that the package of the workbench application does not depend on
- **THEN** the job does not run the tests and does not fail

### Requirement: The real state agrees with the forced state

For each control that has a forced hover state or a forced focus state in the style guide, a test SHALL put a specimen in the real state, with the pointer for hover and with the Tab key for focus, and compare its computed style with the computed style of the forced specimen. The test SHALL fail when the two are different. No test SHALL check where the force attribute is used.

#### Scenario: The focus of a text input

- **WHEN** the test moves focus to the default specimen of the text input with the Tab key
- **THEN** its border color and its inner shadow are the same as those of the specimen with the forced focus state

#### Scenario: A hover style that only the force gets

- **WHEN** a person changes the hover look of the neutral button so that only the forced state gets it, and runs the tests
- **THEN** the test of the neutral button fails, and the screenshot tests pass

#### Scenario: The screenshot of a section

- **WHEN** the screenshot test of the components section runs
- **THEN** it takes one screenshot of the section in each theme, of a page that the test did not touch
