---
issue: https://github.com/twin-digital/opus/issues/543
milestone: https://github.com/twin-digital/opus/milestone/20
---

# Proposal

## Why

A designer can make a product on the workbench, but an end user cannot run it. The product runs only from the checkout of the repository, with the packages of the workbench. Issue #543 asks for a build that an end user runs. It is the first result of the milestone `[WSH] A6 Distribution`.

## The rule of the hub, and the result of the issue

Rule R21 (**Agreed**, owner, 2026-11-27) says: "The hub of a construct runs in a Node.js process. For the first versions of Wishem, the hub of each construct is in a Node.js process. A renderer is in a different process, such as a page in a web browser or an engine, and it reaches the hub through the link." Its "Rejected:" line is "a hub in the page of a renderer, with no link. The owner rejected it for the PixiJS renderer on 2026-11-27." `concepts.md` (Distribution) gives the same rule for the MVP.

The issue says: "A product with a browser renderer runs with the hub in the page, from static files." The rule forces one change to that result:

- **Kept:** the page of the product is static files. No development server and no page server of the workbench serve it.
- **Changed:** the hub runs in a Node.js process of the build, the **product process**. The product process serves the static files of the page and the link on one port. The page reaches the hub through the link. The end user starts the product with one command.

The issue gets a comment and a note in its Result that say this.

## What Changes

- A new subcommand `wishem build` of the `wishem` command. It builds a product into one folder, the **product build**, and writes a `.tar.gz` archive of the folder. The options are the options that the workbench and `wishem start` use for a product: `--product`, `--product-code`, and `--product-views`. The option `--godot-views` adds a Godot application.
- The product build holds the product process (one JavaScript file, with the hub, the subsystems, the clock, and the product code), the model folder of the product, the page (static files with the React views of the product), and an optional Godot pack. It holds nothing of the workbench, and the build fails when a module of the workbench gets into it.
- The product build runs with `node run.mjs` on a computer with Node.js 24. It needs no `node_modules` folder and no checkout of the repository.
- A product with a Godot renderer: the build holds the Wishem Godot application with the Godot views of the product, exported as one pack (`godot/product.pck`). The end user runs it with Godot 4.7.2. With `--godot <path>`, the product process starts Godot and gives it the address of the link. The Godot application connects through the link, as each renderer does.
- Each archive has the notice "All rights reserved" (`NOTICE.txt`) and the licence texts of the third-party packages that the build holds (`THIRD-PARTY-NOTICES.txt`). Wishem has no licence (decision of #545).
- The server of a hub can answer each request that does not open the link, with a handler that the program gives. A product construct passes such a handler to its server.
- The Godot application writes a screenshot only with `--shots`. With no `--shots`, it shows one line for each new picture. An end user then gets no file on each tick.
- A new private package `@thrashplay/wishem-product-build` holds the product process, the product page, and the builder.
- A release of the sample product as a GitHub prerelease, made by hand after the merge (decision of #545). No CI workflow makes a release (#550 is a plan only).

## Capabilities

### New Capabilities

- `wishem/distribution/product-build`: the command `wishem build`, the content of the product build and of its archive, the notices, and the checks that refuse a build.
- `wishem/distribution/product-process`: the command `node run.mjs` of a product build: the product construct, the one port for the page and the link, the lines in the terminal, the start of Godot, and the stop.
- `wishem/distribution/product-page`: the page of a product build: static files that draw the React views of the product through the link.

### Modified Capabilities

- `wishem/host-nodejs/server`: a program can answer each request that does not open the link. With no handler, each such request still gets status 404.
- `wishem/host-nodejs/cli`: the `wishem` command has the subcommand `build`, and the usage line names it.
- `wishem/workbench/construct-manager`: a product construct can serve other requests on the port of its link, and it gives the HTTP address of its server.
- `wishem/renderer-godot/application`: the application writes screenshots only with `--shots`, shows a line for each picture, and can be exported as a pack with the views of a product.
- `wishem/architecture/diagrams`: the system context diagram shows the end user, and the container diagram shows the product build, the product process, the product page, and the Godot application of a build.

## Impact

- New package `nodejs/wishem/product-build` (private). It uses `vite` and `@vitejs/plugin-react` to build, and `tar` to write the archive.
- `command`: the subcommand `build`.
- `host-nodejs` (`serveHub`), `construct-manager` (`startProductConstruct`): an optional request handler.
- `renderer-godot`: `godot/main.gd`, an export preset, `exportGodotPack`, and the Docker image (export templates, if Godot needs them for a pack).
- `docs/architecture/` (document, `render.mjs`, SVG files), `docs/concepts.md`, `docs/glossary.md`, `docs/autonomous-flow.md` (the port table), `CLAUDE.md` of Wishem, the READMEs, and `turbo.json` (the `test:ui` entry of the new package).
- Overlaps: #544 (the workbench to a designer) can use the archive writer, the notices, and the release steps of this change. #550 (a CI release workflow) gets the exact build command, the archive name, and the release steps that it will automate.
- Not changed: no npm package becomes public, and no package is published to npm. No file in `.github/workflows/` changes.
