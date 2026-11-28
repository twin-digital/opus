# Spec Delta

## MODIFIED Requirements

### Requirement: The component diagram of the page

The architecture document SHALL hold a C4 component diagram of the page of the workbench, in `nodejs/wishem/docs/architecture/components-page-light.svg` and `components-page-dark.svg`. The diagram SHALL show the parts of the HTML renderer and how a view gets to the renderer.

#### Scenario: A change alters how a view gets to the renderer

- **WHEN** a change adds a part between the view files and the renderer, or removes one
- **THEN** the component diagram shows the parts and their relationships after the change

#### Scenario: A change replaces the client of the page

- **WHEN** a change replaces the part of the page that gets the model from the workbench process
- **THEN** the component diagram shows the new part, its technology, and its relationship to the process

#### Scenario: The renderer reads through a port

- **WHEN** the client of the hub gives the port of each link, and the renderer and the table of views come from `@thrashplay/wishem-renderer-react`
- **THEN** the component diagram shows that the renderer reads the part `store` through the port, and its technology lines name `renderer-react` for the renderer and the table of views

#### Scenario: A view sends an input

- **WHEN** a view sends an input through the prop `wishem`, and the renderer sends it through the input port that the client of the hub gives
- **THEN** the component diagram shows a relationship from the views to the renderer with the label "Send inputs [wishem]", and the relationship from the renderer to the client of the hub says that the renderer reads and sends through the ports

#### Scenario: A tool of the page reads a different part

- **WHEN** the product panel reads the part `product` through the output port and sends `product/set-field` and `product/clear-field` through the input port
- **THEN** the component diagram shows the product panel as a component with its relationship to the client of the hub, which names `set-field` and `clear-field`, and its relationship to the catalog
