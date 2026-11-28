# Spec Delta

## Purpose

Defines the command `wishem build`, which makes a product build that an end user runs, and its archive: what the build holds, what it never holds, the notices, and the cases in which the command refuses to build.

## ADDED Requirements

### Requirement: One command builds a product

The command `wishem build --product <folder> --out <folder>` SHALL read and check the model folder of the product and write one folder, the product build, at `--out`. It SHALL also write the archive `<out>.tar.gz`, which holds the folder under its own name. The options `--product-code`, `--product-views`, `--godot-views`, `--name`, and `--step-ms` SHALL be optional. The command SHALL print the path of the build and of the archive, and end with exit code 0.

#### Scenario: The sample product

- **WHEN** the designer runs `wishem build --product <sample model> --product-code @thrashplay/wishem-sample-product --product-views <sample views/react> --name sample-product --step-ms 500 --out <dir>/sample-product`
- **THEN** the terminal shows `wishem: build at <dir>/sample-product` and `wishem: archive at <dir>/sample-product.tar.gz`, and the command ends with exit code 0

#### Scenario: The archive holds the folder

- **WHEN** a person extracts `sample-product.tar.gz` in an empty folder
- **THEN** the folder holds one folder `sample-product` with the same files as the product build

### Requirement: The product build holds the parts of a product

The product build SHALL hold `run.mjs` (the product process, with the hub, the subsystems, the clock, and the product code), `model/` (a copy of the model folder of the product), `product.json` (the name and the step of the clock), `README.txt` (how to run it), `NOTICE.txt`, and `THIRD-PARTY-NOTICES.txt`. With `--product-views`, it SHALL hold `page/`. With `--godot-views`, it SHALL hold `godot/product.pck`.

#### Scenario: A build with a page

- **WHEN** the designer builds the sample product with `--product-views`
- **THEN** the build holds `run.mjs`, `model/definitions/`, `model/state.json`, `product.json`, `README.txt`, `NOTICE.txt`, `THIRD-PARTY-NOTICES.txt`, and `page/index.html`, and it holds no `godot/` folder

#### Scenario: The name and the step

- **WHEN** the designer gives `--name sample-product --step-ms 500`
- **THEN** `product.json` holds the name `sample-product` and the step 500

#### Scenario: No name and no step

- **WHEN** the designer gives no `--name` and no `--step-ms`, and `--out` is `<dir>/game`
- **THEN** `product.json` holds the name `game` and the step 50

### Requirement: The product build runs with no other file

The product build SHALL run on a computer with Node.js 24 with no `node_modules` folder, no package manager, and no checkout of the repository. Each module that `run.mjs` and the page need SHALL be in the build.

#### Scenario: A build outside the repository

- **WHEN** a person extracts the archive in a folder outside the repository and runs `node run.mjs --port 0` in the folder `sample-product`
- **THEN** the product process starts and prints the address of the page and of the link

### Requirement: The product build holds nothing of the workbench

The command SHALL refuse a build in which a bundle holds a module of the workbench: a module of `workbench`, `workbench-app`, or `command`, a module of `construct-manager` other than the product construct, or a module of Vite. It SHALL print `wishem: the build holds <module>, which is not part of a product`, write no archive, and end with exit code 1. The page SHALL hold no hub.

#### Scenario: The sample product

- **WHEN** the designer builds the sample product
- **THEN** no module of the bundles is in a package of the workbench, and the bundle of the page holds no module of the hub other than the link client

#### Scenario: A module of the workbench gets into the build

- **WHEN** the product code imports a module of `@thrashplay/wishem-workbench-app`
- **THEN** the command prints the line with that module, writes no archive, and ends with exit code 1

### Requirement: Each archive has the notices

`NOTICE.txt` SHALL hold the line `All rights reserved.` and SHALL name Wishem. `THIRD-PARTY-NOTICES.txt` SHALL hold, for each third-party package that a bundle of the build holds, its name, its version, and the text of its licence file.

#### Scenario: The notices of the sample product

- **WHEN** a person reads the notices of a build of the sample product with a page
- **THEN** `NOTICE.txt` holds `All rights reserved.`, and `THIRD-PARTY-NOTICES.txt` names `react`, `react-dom`, and `ws`, each with the text of its licence

### Requirement: The command does not build a product that is not correct

The command SHALL check the model, the product code, and the views before it writes a file. When a check fails, it SHALL print the reason, write no file, and end with exit code 1. A usage error SHALL end with exit code 2.

#### Scenario: A model that is not correct

- **WHEN** `state.json` of the product is not valid JSON
- **THEN** the command prints a problem that names `state.json`, writes no file, and ends with exit code 1

#### Scenario: Product code that cannot be loaded

- **WHEN** `--product-code` names a module that does not exist
- **THEN** the command prints `wishem: the product code <value> cannot be loaded: <reason>`, writes no file, and ends with exit code 1

#### Scenario: A views folder with no view

- **WHEN** `--product-views` names a folder that holds no sidecar of the kind `react`
- **THEN** the command prints `wishem: the folder <folder> holds no React view`, writes no file, and ends with exit code 1

#### Scenario: No renderer

- **WHEN** the designer gives neither `--product-views` nor `--godot-views`
- **THEN** the command prints `wishem: a build needs --product-views or --godot-views` and the usage line, and ends with exit code 2

#### Scenario: The output folder exists

- **WHEN** `--out` names a folder that is not empty, or `<out>.tar.gz` exists
- **THEN** the command prints `wishem: <path> exists`, changes no file, and ends with exit code 1

### Requirement: A product build with a Godot renderer

With `--godot-views <folder>`, the command SHALL export the Wishem Godot application with the Godot views of that folder as one pack, `godot/product.pck`, in Docker. The pack SHALL hold no test of the application. When Docker is not available, the command SHALL show that it needs Docker, write no archive, and end with exit code 1.

#### Scenario: The Godot views of the sample product

- **WHEN** the designer builds the sample product with `--godot-views nodejs/wishem/renderer-godot/godot/views`
- **THEN** the build holds `godot/product.pck`, and the terminal shows `wishem: Godot pack at <out>/godot/product.pck`

#### Scenario: Docker is not available

- **WHEN** `docker info` fails and the designer gives `--godot-views`
- **THEN** the command shows that it needs Docker, writes no archive, and ends with exit code 1
