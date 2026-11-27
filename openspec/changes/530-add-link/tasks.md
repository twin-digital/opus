# Tasks

## Task 1: Channels, messages, and the hub side of a link

Files: `nodejs/wishem/hub/src/link/channel.ts`, `nodejs/wishem/hub/src/link/channel.test.ts`, `nodejs/wishem/hub/src/link/messages.ts`, `nodejs/wishem/hub/src/link/messages.test.ts`, `nodejs/wishem/hub/src/link/serve-link.ts`, `nodejs/wishem/hub/src/link/serve-link.test.ts`, `nodejs/wishem/hub/src/index.ts`
Interfaces: consumes `Hub`, `Port`, `Input`, `RecordedInput`, `JoinedState`, `HubStatus`, `SubmitResult`, and `IoSubsystem` of `@thrashplay/wishem-hub`; produces `Channel`, `createChannelPair`, `WebSocketLike`, `webSocketChannel`, `LINK_PROTOCOL_VERSION`, `ClientMessage`, `HubMessage`, `RefusalReason`, a parser `parseClientMessage(text: string): ClientMessage | undefined` and a parser `parseHubMessage(text: string): HubMessage | undefined` (internal to the package), and `serveLink`, as in the "Interfaces" section of `design.md`

- [x] 1.1 Write `Channel`, `createChannelPair`, `WebSocketLike`, and `webSocketChannel` in `src/link/channel.ts`. A message of the pair arrives in a later microtask, and a message that arrives before a listener is registered waits. Write each test before its code, and see it fail first. Verify with tests: the order of the messages, the close of each side, a message before the listener, and `webSocketChannel` with a fake socket that opens, that fails before it opens, and that gets a message that is not text
- [x] 1.2 Write the message types and the two parsers in `src/link/messages.ts`. A parser returns `undefined` for text that is not a JSON object with a string `t`, and for a known type that lacks a key or has a key of an incorrect type. It returns the object for an unknown `t`, typed so that the caller can ignore it. Verify with tests for each message type and each kind of fault
- [x] 1.3 Write `serveLink` in `src/link/serve-link.ts`. Write each test before its code, and see it fail first. The tests use `createHub` and one side of a channel pair, and they send and read raw messages. Verify that `src/link/serve-link.test.ts` has one test for each scenario of these requirements of `specs/wishem/hub/link/spec.md`: "A link is a sequence of JSON messages on one connection", "The client starts a link with a hello message", "The welcome message holds the joined state", "The hub side refuses a hello that it cannot serve", "The hub side sends each event one time for each link", "An applied message holds the input and the parts that changed", "The client sends inputs with a request number", "The end of a connection detaches the subsystems", and the hub side of "A side ignores a message type that it does not know"
- [x] 1.4 Verify that `pnpm exec turbo run lint typecheck test build --filter @thrashplay/wishem-hub` passes

## Task 2: The remote port and the document of the protocol

Files: `nodejs/wishem/hub/src/link/open-link.ts`, `nodejs/wishem/hub/src/link/open-link.test.ts`, `nodejs/wishem/hub/src/link/examples.ts`, `nodejs/wishem/hub/src/link/examples.test.ts`, `nodejs/wishem/hub/src/index.ts`, `nodejs/wishem/hub/LINK.md`, `nodejs/wishem/hub/README.md`
Interfaces: consumes `Channel`, `createChannelPair`, `serveLink`, `parseHubMessage`, `ClientMessage`, and `HubMessage` of Task 1; produces `openLink`, `RemoteLink`, `LinkRefusedError`, and `LinkClosedError`, as in the "Interfaces" section of `design.md`

- [ ] 2.1 Write `openLink` in `src/link/open-link.ts`. Write each test before its code, and see it fail first. The tests for the usual paths connect `openLink` to `serveLink` and a real hub with a channel pair. The tests for a fault of the hub side send raw messages. Verify that `src/link/open-link.test.ts` has one test for each scenario of the requirements "A remote port has the behavior of a port", "A remote port reports the end of its link", "The link runs on a WebSocket and in memory", and the client side of "A side ignores a message type that it does not know", and a test for a refused `hello`
- [ ] 2.2 Add a test that proves the same behavior on the two kinds of port: one function gets a `Port` and an input, and it runs against a port of `hub.attach` and against a remote port. The two runs give equal results, equal events, and equal states
- [ ] 2.3 Write `src/link/examples.ts` with the example messages of `design.md` as typed values, and `LINK.md` with each message, each key and its type, the order of the messages, each reason of `refused`, the rule for an unknown type, the reserved types, and one full example of a link. Use Simplified Technical English. Verify with `src/link/examples.test.ts` that each JSON block of `LINK.md` is deeply equal to one example value, and that a real link between `openLink` and `serveLink` produces the example messages for the example inputs
- [ ] 2.4 Add a section on the link to `README.md` of the package, with a link to `LINK.md` and an example that uses `createChannelPair`. Verify that the example is also a test that passes
- [ ] 2.5 Verify that `pnpm exec turbo run lint typecheck test build --filter @thrashplay/wishem-hub` passes

## Workflow follow-up

- Start the branch from `main` after the pull request of #528 is merged.
- Break-test `@thrashplay/wishem-hub` before the final review.
- Add the changeset: `@thrashplay/wishem-hub`, minor.
- Archive the change, which puts the specification in `openspec/specs/wishem/hub/link/spec.md`.
- Open the pull request with `Closes #530`.
