# Spec Delta

## ADDED Requirements

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
