# Spec Delta

## Purpose

Defines the page of a product build: static files that a web browser gets from the product process, and that draw the React views of the product from the hub of the product process through the link.

## ADDED Requirements

### Requirement: The page is static files

The page of a product build SHALL be static files in `page/`: one `index.html` and the files that it loads. The page SHALL need no development server and no server of the workbench. It SHALL hold no hub.

#### Scenario: The files of the page

- **WHEN** a person lists `page/` of a build of the sample product
- **THEN** it holds `index.html` and JavaScript files, and no TypeScript file and no source map of a package of the workbench

### Requirement: The page draws the product through the link

The page SHALL open one link at `/link` of its own address, with one output subsystem and one input subsystem. It SHALL draw the part `store` with the React renderer and the React views of the product, and give the views the input port. After a loss of the link, it SHALL keep the last picture and open the link again.

#### Scenario: The first picture

- **WHEN** the end user opens the page of a running build of the sample product that started with `--paused`
- **THEN** the page shows the color box with the name `Color #1d4ed8` and the text `Count 0`

#### Scenario: One tick

- **WHEN** a client of the link sends `time/advance` of 500
- **THEN** the page shows `Color #b91c1c` and `Count 1`

#### Scenario: The product process starts again

- **WHEN** the product process stops and starts again on the same port
- **THEN** the page opens the link again with no reload and shows the picture of the new start

### Requirement: The page shows the state of the link

The page SHALL show the text `Connecting` before the first `welcome`, no status text while the link is open, and `No link. The page tries again.` while the link is down.

#### Scenario: The product process stops

- **WHEN** the product process stops while the page is open
- **THEN** the page shows `No link. The page tries again.` and keeps the last picture
