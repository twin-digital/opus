# Spec Delta

## Purpose

Defines the stage of the workbench page: the picture of the product construct `play`, drawn from its own link with the React renderer and the React views of the product, and the states of the stage when no picture is available.

## ADDED Requirements

### Requirement: The stage draws the product construct through its own link

While `play` has the status `running` and an address of a link, the page SHALL open one link at `/constructs/play/link` of the origin of the page, with one output subsystem and no input subsystem. The stage SHALL draw the part `store` of that link with the React renderer and the React views of the product. The page SHALL close the link when `play` stops, and SHALL open a new link when the address of `play` changes.

#### Scenario: The sample product on the stage

- **WHEN** the workbench runs with the sample product, its product code, and `--product-views nodejs/wishem/sample-product/views/react`, and the designer presses `Run`
- **THEN** the stage shows a box in the color of the `Color` component and the text of the count, and the count increases while `play` runs

#### Scenario: A stop and a run

- **WHEN** `play` runs, the designer presses `Stop`, and then `Run`
- **THEN** the stage connects to the new address, and the count starts again from the count of the product model

#### Scenario: The workbench link

- **WHEN** the stage draws `play`
- **THEN** the link of the page to the workbench construct does not change, and the record of `play` holds no input from the page

### Requirement: A change of the authored state shows on the stage

A change of the part `product` of the workbench SHALL show on the stage after the construct manager sends it to `play`, with no reload of the page.

#### Scenario: A change in the product panel while paused

- **WHEN** `play` is paused with the count `c`, and the designer sets the count to `100` in the product panel
- **THEN** the stage shows the count `100` within 2 seconds, and the controls show the same tick as before

#### Scenario: A hand edit while the construct runs

- **WHEN** `play` runs, and a person changes the count in the `state.json` of the product folder to `500`
- **THEN** the stage shows a count of `500` or more within 2 seconds

### Requirement: The stage shows a state when it has no picture

The stage SHALL show a zero state with the label `Stage` when it has no picture: `Not running. Press Run to start the product.` when `play` does not run, `Connecting to the product.` before the first `welcome` of its link, and `The product has no React views.` when the page has no React views of the product. When the link of the stage is down, the stage SHALL keep the last picture and SHALL show `The product is not reachable. The page tries again.`

#### Scenario: No product views

- **WHEN** the workbench runs with a product and no `--product-views`, and `play` runs
- **THEN** the stage shows `The product has no React views.`, and the controls show the tick

#### Scenario: Before a run

- **WHEN** `play` is not in the list
- **THEN** the stage shows `Not running. Press Run to start the product.`

### Requirement: The React views of the product follow their files

The page SHALL load the React views of the product that the workbench page server gives. A saved change to a view file of the product SHALL show on the stage with no reload by hand. A sidecar that is not correct SHALL give a message in the console of the browser, and the stage SHALL show `The views of the product are not correct.`

#### Scenario: An edit of a product view

- **WHEN** `play` runs on the stage, and a person saves a change to `nodejs/wishem/sample-product/views/react/Count.tsx`
- **THEN** the stage shows the change, and the controls keep their state
