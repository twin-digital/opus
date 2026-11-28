# Spec Delta

## ADDED Requirements

### Requirement: The diagrams show the run controls and the stage

The component diagram of the page SHALL show the run controls and the stage as components, the link of the stage to the product construct, and the views of the product. The container diagram SHALL show that the page connects to the product constructs through the workbench process, and that the page draws with the React views of the sample product.

#### Scenario: The component diagram of the page

- **WHEN** the run controls read the part `constructs` and send inputs through the client of the hub, and the stage reads a product construct through its own link
- **THEN** the component diagram shows the run controls with their relationship to the client of the hub, the stage with its relationship "Connects to the product construct [WebSocket link]" to the workbench process, and the views of the product that the stage draws with

#### Scenario: The container diagram

- **WHEN** the page opens a link at `/constructs/<id>/link`, and the workbench process passes it to the product construct
- **THEN** the container diagram shows the relationship from the page to the workbench process for the links of the product constructs, and the row of the sample product names its React views
