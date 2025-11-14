VERSION 0.8
FROM node:22-alpine

install:
  COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .
  COPY ./nodejs/*/*/package.json  .
  RUN corepack enable && pnpm install
  SAVE ARTIFACT pnpm-lock.yaml AS LOCAL pnpm-lock.yaml

build:
  BUILD ./docker/node+build

publish:
  BUILD ./docker/node+publish