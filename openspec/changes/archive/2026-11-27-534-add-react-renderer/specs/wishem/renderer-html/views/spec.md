# Spec Delta

## ADDED Requirements

### Requirement: The product gives its views to the table of views

The table of views SHALL be a part of the React renderer package. The product SHALL give the table its sidecars and its view files as loaded modules, each with the path of its file. The package SHALL read no folder and SHALL know no folder of a product. The views and the sidecars SHALL be files of the product.

#### Scenario: The views of the workbench

- **WHEN** the page of the workbench gives the sidecars and the view files of its `src/views` folder to the table of views
- **THEN** the table has the view of `AppBar.tsx` for the component type `ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34`

#### Scenario: A product with no views

- **WHEN** a product gives no sidecar and no view file
- **THEN** the table of views is empty, and the renderer draws nothing and reports no error
