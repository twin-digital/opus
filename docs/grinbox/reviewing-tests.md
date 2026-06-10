# Reviewing Unit Tests Against a Spec — A Handoff Procedure

These are instructions for evaluating a test suite given three inputs: **the spec**, **the code under test**, and **the tests themselves**. Work the phases in order — the ordering matters, because Phase 0 prevents the most common failure mode (being anchored by the tests into thinking the tested behavior is the complete behavior).

---

## Phase 0 — Frame the review

Before reading a single test, answer:

- **What is the unit?** A pure function, a class, a module, a stateful component? This determines what "good" looks like.
- **What does the spec say this code must do?** Extract a list of discrete, checkable claims from the spec. Each requirement, each "must/should/when X then Y", each stated edge case and error condition becomes a line item. This list is your **coverage oracle** — you'll check tests against it, not the other way around.
- **What is the code's actual contract?** Read the code and list its inputs, outputs, branches, error paths, side effects, and boundary conditions — independently of both the spec and the tests. Note where code and spec disagree; that gap is a finding regardless of test quality.

You now have two reference lists (spec-required behaviors, code-actual behaviors) built _without_ looking at the tests. Only now open the tests.

---

## Phase 1 — Coverage (behavioral, not line)

Line/branch coverage tells you what code _ran_, not what was _verified_. Use it as a floor, not a measure of quality.

Map every test to your Phase 0 lists and look for:

- **Spec requirements with no test.** Each unmatched line item is a coverage gap. Rank by risk.
- **Code branches/paths with no test.** Every `if`, `switch`, early return, `catch`, default value, and loop boundary. Generate a coverage report if available and reconcile uncovered lines against your manual list — but treat "100% line coverage" with suspicion (see Phase 3).
- **Boundary and edge values.** Empty/null/undefined inputs, zero, negative numbers, off-by-one boundaries (`n`, `n-1`, `n+1`, max), empty collections, single-element collections, very large inputs, duplicates, unicode/whitespace in strings.
- **Error and failure paths.** Does each thrown error / rejected promise / error return get a test that asserts the _specific_ failure, not just "it failed"?
- **State transitions.** For stateful units: are illegal transitions tested? Re-entrancy, idempotency, ordering effects?
- **Concurrency / async behavior** if relevant: races, cancellation, timeouts, partial failures.

**Output:** a coverage matrix — rows = spec/code behaviors, columns = which test(s) cover each, with explicit "GAP" markers.

---

## Phase 2 — Adequacy: would these tests actually catch a bug?

A test that runs the code but doesn't meaningfully verify it is worse than no test — it gives false confidence. For each test ask:

- **Does it assert on the right thing?** Strong assertions on the actual output/effect, not incidental properties. Flag tests that only assert "did not throw," only check a value is truthy/defined, or assert on log output instead of behavior.
- **Apply the mutation-testing mindset:** for each test, imagine breaking the code it covers (flip a `<` to `<=`, return a constant, skip a side effect, drop an error). _Would this test fail?_ If you can mutate the code and the test still passes, the assertion is too weak or misplaced. If a mutation tool (Stryker, mutmut, PIT, etc.) is available, run it and treat surviving mutants as findings.
- **Is the assertion specific?** `expect(result).toBeTruthy()` where the spec says it should equal `42` is a weak test. Prefer exact-value or exact-shape assertions.
- **Does the test verify the behavior, or restate the implementation?** A test that mirrors the code's own logic (recomputing the expected value with the same algorithm) tests nothing. Expected values should be independently derived / hand-computed / from the spec.

---

## Phase 3 — Quality and craftsmanship

- **Naming:** the test name should state the scenario and expected outcome (`returns_empty_list_when_input_is_null`), not the method name. A reader should know what broke from the failure line alone.
- **Structure:** clear Arrange / Act / Assert. One logical behavior per test. Multiple unrelated assertions in one test obscure _which_ thing broke.
- **No logic in tests:** loops, conditionals, try/catch-to-pass, and computed expected values are smells — they can hide bugs and themselves contain bugs. Parameterized/table-driven tests are the right tool when you genuinely need many input variants.
- **Determinism:** no dependence on wall-clock time, timezone, locale, random seeds, network, filesystem, or test execution order. Flag any `sleep`, real `Date.now()`, real I/O, or shared mutable state between tests. These produce flakes.
- **Isolation:** each test sets up and tears down its own state. Tests must pass when run alone and in any order.
- **Failure quality:** when a test fails, is the message diagnostic? Custom matchers / good assertion libs beat bare boolean checks.

---

## Phase 4 — Redundancy and over-testing

- **Duplicate coverage:** multiple tests exercising the identical path with no new input/branch add maintenance cost without value. Recommend merging into a parameterized case — but _only_ if they truly cover the same behavior; near-duplicates that hit different boundaries are not redundant.
- **Over-mocking:** mocks of the very thing under test, or mock setups so detailed the test asserts on call sequences rather than outcomes. This couples tests to implementation and they break on every refactor while catching no real bugs. Flag tests that would fail on a behavior-preserving refactor.
- **Testing the framework / language / library:** tests that verify a third-party dependency or the language itself rather than this code.
- **Snapshot abuse:** large auto-generated snapshots that nobody reads, get blindly re-recorded on failure, and assert on everything (so they assert on nothing meaningfully).
- **Testing implementation details:** assertions on private methods, internal call counts, or internal data structures rather than observable behavior — brittle and low-value.

---

## Phase 5 — Synthesize the report

Produce a structured report:

1. **Coverage matrix** (Phase 1) with explicit gaps, ranked by risk.
2. **Adequacy findings** — tests that run but don't meaningfully verify; surviving mutants.
3. **Quality findings** — naming, structure, determinism, isolation issues, with file:line references.
4. **Redundancy findings** — specific consolidation recommendations.
5. **Spec/code/test three-way disagreements** — where the code doesn't match the spec, or tests encode behavior the spec doesn't mention (these are either undocumented requirements or wrong tests — flag for a human to adjudicate).
6. **Prioritized action list** — the few changes that most improve confidence, separated from nice-to-haves.

For every finding, cite `file:line` and state _why_ it matters (what bug it would let through, or what cost it imposes), not just _what_ it is.

---

## Guiding principles to keep in mind throughout

- **Coverage is necessary but not sufficient.** 100% line coverage with weak assertions is a worse signal than 80% with strong ones.
- **A test's job is to fail when the behavior is wrong.** If you can't construct a realistic bug the test would catch, the test isn't pulling its weight.
- **Tests should be coupled to behavior, not implementation.** The refactor test: "would this break if I rewrote the internals but kept the contract?" If yes, it's testing the wrong layer.
- **The spec is the oracle for _what_ to test; the code is the oracle for _what could break_.** Use both — tests should cover the union, and disagreements are themselves findings.
- **Don't trust the tests to tell you what the code does.** Build your own model first (Phase 0), or you'll just rubber-stamp whatever the tests happen to assert.
