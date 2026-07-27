# Test plan — `@twin-digital/mc-dev-kit`

Built from `plan-opus` design `minecraft/dev-kit`. Every case below names the spec rule it covers.
Tests are colocated `*.test.ts` beside the module they exercise; workspace fixtures are written to
a temp directory by `test/fixture.ts` and removed after each test, so every case runs against a
real filesystem and real enumeration libraries — the two libraries are the contract under test in
the enumerator, so they are never mocked.

## Fixture helper (`test/fixture.ts`)

`writeWorkspace(files: Record<string, string | object>)` writes a tree under a fresh temp dir and
returns its absolute path; `packManifest(kind, overrides)` builds a plausible source manifest so a
case states only the field it is about. It sits outside `src/` so it never reaches the build. No
test of the helper itself beyond its use everywhere else.

## `workspace-enumerator` (`workspace-enumerator.test.ts`)

Requirements: `packages-come-from-the-workspace-definition`, `enumeration-uses-the-managers-own-libraries`,
`the-root-package-is-a-candidate`, `packs-enumerable-without-a-build`.

1. pnpm workspace: a root holding `pnpm-workspace.yaml` with `packages: ['packages/*']` returns the
   root package and both members, each with its parsed `package.json` fields.
2. pnpm marker wins: a root holding **both** `pnpm-workspace.yaml` and a `workspaces` array in
   `package.json` enumerates by the pnpm patterns, not the npm ones (`d:pnpm-marker-wins-npm-is-the-fallback`).
3. pnpm `packages` field absent: the patterns reach the library as `undefined`, leaving it on its
   own defaults (`['.', '**']`), so every nested package is a candidate. The spec's claim that this
   yields the root alone is contradicted by the library — see the PR's flagged finding.
4. pnpm exclusion: a `!packages/ignored` pattern excludes that directory — the kit forwards the list
   unread and the library applies it.
5. npm workspace: a root with `workspaces: ['packages/*']` returns both members **and** the root
   package, which `mapWorkspaces` never returns (`r:the-root-package-is-a-candidate`).
6. npm root declaring no `workspaces` array: the root alone is a candidate — a single non-monorepo
   package still enumerates.
7. npm root with an empty `workspaces` array: the root alone.
8. Deduplication: an npm root its own `workspaces` patterns also match yields one candidate for it,
   not two.
9. A directory holding its own valid `package.json` that the workspace patterns do not match is no
   candidate — membership comes from the definition, not a tree walk
   (`r:packages-come-from-the-workspace-definition`).
10. `packageDir` spellings: the root is `.`, a member is `packages/mc-pack-1` — POSIX, no `./`
    prefix, no trailing slash (`d:relative-paths-are-posix-with-the-root-as-a-dot`).
11. No install needed: every fixture above is uninstalled — no `node_modules`, no lockfile — and
    enumeration still succeeds (`r:packs-enumerable-without-a-build`).
12. Rejects when the root holds neither a `pnpm-workspace.yaml` nor a `package.json`.
13. Rejects when the root `package.json` is not valid JSON, with the underlying error unwrapped.
14. Rejects when the root `pnpm-workspace.yaml` is present but is not valid YAML, likewise unwrapped.
15. Rejects when a **member** `package.json` is not valid JSON, under npm (`EJSONPARSE`) and under
    pnpm (`ERR_PNPM_JSON_PARSE`) — one bad member fails the whole call
    (`f:a-malformed-member-manifest-fails-the-whole-enumeration`, `d:enumeration-failure-rejects-the-call`).
16. A directory a pattern matches that holds no `package.json` is skipped, and the other members
    enumerate normally.

## `pack-locator` (`pack-locator.test.ts`)

Requirements: `membership-from-source-manifest-presence`, `built-output-defaults-to-dist`,
`built-output-mirrors-the-source-layout`, `pack-record-details`.

17. A candidate holding `behavior_pack/manifest.json` yields one entry of kind `behavior`.
18. A candidate holding `resource_pack/manifest.json` yields one entry of kind `resource`.
19. A candidate holding both yields two entries, behavior before resource.
20. A candidate holding neither yields no entry at all — not an empty or invalid one
    (`d:a-package-with-no-source-manifest-yields-no-entry`).
21. A `manifest.json` elsewhere in the package (`packs/behavior_pack/manifest.json`, or the package
    root) yields no entry: only the two fixed paths are probed.
22. Locations: `sourceDir` is `<packageDir>/behavior_pack`, `outputDir` is
    `<packageDir>/dist/behavior_pack`, and for the root package they are `behavior_pack` and
    `dist/behavior_pack` with no `./` prefix.
23. `outputDir` is reported when the output tree does not exist
    (`d:output-locations-are-computed-not-probed`).
24. `packageName` is the `package.json` `name` when it declares a string one.
25. `packageName` falls back to the package directory's basename when it does not, and to the
    workspace root directory's own name for the root package
    (`d:a-nameless-package-is-named-by-its-directory`).
26. An unreadable manifest — a directory in the file's place — is `manifest-unreadable` carrying the
    underlying message, with no `manifest` on the entry and every other detail still present.
27. A manifest that is not valid JSON is the same one problem, `manifest-unreadable`
    (`d:unreadable-and-unparseable-manifests-are-one-problem`).
28. Shape: a manifest parsing to a JSON array, a string, or `null` is `manifest-shape-invalid` with
    `field: ''`, and the parsed value is still reported as `manifest`.
29. Shape: `header` that is not an object is `manifest-shape-invalid` with `field: 'header'`.
30. Shape: `modules` that is not an array is `field: 'modules'`; a non-object element is
    `field: 'modules[1]'`.
31. Shape: `dependencies` that is not an array is `field: 'dependencies'`; a non-object element is
    `field: 'dependencies[1]'`.
32. A shape fault raises exactly one problem and does not cascade: a manifest whose `header` is a
    string carries no `manifest-missing-uuid`, one whose `modules` is a string carries no
    `kind-not-corroborated`, and one whose `dependencies` is a string carries no dependency problem
    of any code (`d:manifest-shape-faults-are-one-problem`).
33. Absent `header`, `modules`, or `dependencies` is not a shape fault.

## `manifest-completion` (`manifest-completion.test.ts`)

Requirements: `kit-completes-partial-source-manifests`, `manifest-format-version-passes-through`,
`uuids-compare-case-insensitively`.

34. `header.name` is completed from the owning package's `productName`.
35. `header.name` falls back to the package `name` with its npm scope stripped
    (`@scope/mc-pack-1` → `mc-pack-1`).
36. A `productName` that is absent, empty, or not a string falls back to the name and raises no
    problem (`d:product-name-must-be-a-non-empty-string`).
37. A package declaring no string `name` is `package-name-missing`, its `header.name` completes from
    the directory basename, and the entry is invalid.
38. `package-name-missing` is raised even when a `productName` completed `header.name` cleanly
    (`r:pack-record-details`).
39. A source `header.name` of `''` is completed like an absent one
    (`d:empty-header-name-reads-as-unspecified`).
40. Any other present `header.name` is `header-name-specified`, and completion still writes the
    package's name.
41. `header.version` is completed from the package `version` as a SemVer string, at
    `format_version` 1, 2, and 3 alike, and for a pre-release version.
42. What the source `header.version` held is not consulted: a placeholder `[0, 0, 0]`, `'0.0.0'`,
    `''`, and an absent field all complete to the same string and raise no specified-field problem.
43. A present, non-placeholder `header.version` is `header-version-specified`.
44. A `package.json` with no `version` is `package-version-missing`, with `field: 'header.version'`
    and `packageDir` naming the entry's own package.
45. A `package.json` `version` that is not a version is `package-version-invalid`, carrying `value`
    as it was written.
46. `format_version` passes through untouched, whatever it declares, and an unrecognised or absent
    one restricts nothing (`r:manifest-format-version-passes-through`).
47. An array version at `format_version` 3 is `array-version-at-format-version-3` with
    `field: 'header.version'` — placeholder or not.
48. The same at `dependencies[0].version`, both for an entry matching a pack in the set and for one
    matching none, since the check reads every version completion touches.
49. An array version at every other format version, and with no `format_version`, is no problem
    (`d:only-format-version-3-restricts-version-form`).
50. A `modules[].version` array at `format_version` 3 raises nothing: the check reads only the two
    fields completion touches.
51. A `dependencies` entry whose `uuid` names a pack in the set has its `version` completed from
    that pack's owning package's `version`.
52. The uuid match is case-insensitive in both directions (`r:uuids-compare-case-insensitively`).
53. A placeholder version on such an entry — `''`, `'0.0.0'`, `[0, 0, 0]` — reads as unspecified: it
    is completed and raises no `dependency-version-specified`.
54. A specified version on such an entry is `dependency-version-specified` with `field` and `uuid`.
55. A missing or invalid `version` on the **depended-on** package is `package-version-missing` /
    `package-version-invalid` with `field: 'dependencies[0].version'` and `packageDir` naming that
    package, not the entry's own.
56. A `uuid` entry matching no pack but carrying its own version passes through untouched and is no
    problem — the pack it names may be built elsewhere.
57. A `uuid` entry matching no pack and carrying no version is `dependency-unsatisfied` with `uuid`
    as the source wrote it, and the message names both readings
    (`d:an-unsatisfied-dependency-names-both-readings`).
58. A `module_name` entry carrying a version passes through untouched.
59. A `module_name` entry carrying no version is `external-dependency-version-missing` with
    `moduleName` as the source wrote it.
60. A `dependencies` entry carrying both `uuid` and `module_name` is `dependency-entry-malformed`
    naming the entry, and is neither completed nor resolved
    (`d:an-ambiguous-dependency-entry-is-a-problem`).
61. An entry carrying neither is the same problem.
62. The owning `package.json`'s own `dependencies` contribute no manifest dependency entry.
63. Completion of a pack in one package can read the version of a pack in another: the index is
    built across the whole set before any completion runs.
64. Uuids are indexed from invalid packs too, so a dependency on one matches.

## `pack-validation` (`pack-validation.test.ts`)

Requirements: `manifest-corroborates-the-directory-kind`, `uuids-are-claimed-once-in-a-workspace`,
`unresolvable-packs-fail-loudly`.

65. A manifest declaring no `header.uuid` is `manifest-missing-uuid`; a present but non-string uuid
    is the same, since it names no identity the entry can carry.
66. A module declaring no `type` is `module-missing-type` with `field: 'modules[1]'`, one problem
    per offending module.
67. A behavior pack is corroborated by a `data` module, and by a `script` module.
68. A resource pack is corroborated by a `resources` module.
69. A behavior pack whose modules carry neither `data` nor `script` is `kind-not-corroborated`, and
    a resource pack carrying no `resources` module likewise.
70. A manifest with no `modules` key, and one with `modules: []`, is `kind-not-corroborated` and
    raises no `module-missing-type`.
71. A behavior pack carrying a `resources` module is `foreign-kind-module` with `field` and `type`,
    and a resource pack carrying a `data` or `script` module likewise.
72. An unrecognised module type — `client_data`, `world_template` — neither corroborates nor raises
    a problem (`f:module-type-enumerations-disagree`).
73. Two packs claiming one header uuid are both `duplicate-uuid`, each carrying `uuid` and
    `claimants` — the `sourceDir` of every claimant, including its own.
74. Duplicate detection is case-insensitive across differing spellings of one uuid.
75. Module uuids are not checked for uniqueness.
76. A pack depending on an invalid pack is `dependency-invalid` with `field` and `uuid`.
77. Invalidity propagates transitively: a → b → c, where c is invalid, invalidates both a and b
    (`d:invalidity-propagates-to-a-fixpoint`).
78. A dependency cycle among otherwise sound packs stays valid.
79. A dependency on a built-in scripting module never invalidates.
80. An unmatched uuid dependency carrying its own version never invalidates.
81. A pack with no problems is valid, and `problems` is empty.

## `filter` (`filter.test.ts`)

Requirement: `pack-search`.

82. `package` matches the owning package name exactly; a differing case or a substring does not.
83. `name` matches the **completed** `header.name` exactly.
84. `uuid` matches with both sides lowercased (`r:uuids-compare-case-insensitively`).
85. `status` matches `valid` and `invalid`.
86. Criteria combine: an entry must satisfy all of them.
87. A criterion whose value the entry does not carry never matches — no manifest matches no `name`,
    no header uuid matches no `uuid`.
88. Empty criteria match every entry.
89. A non-empty filter that omits `status` matches valid and invalid entries alike.

## `discoverPacks` (`discover-packs.test.ts`)

Requirements: `dev-kit-provides-a-library`, `dev-kit-library-name`, `pack-discovery`,
`pack-record-details`, `pack-search`.

90. End to end on a pnpm workspace of several packages: every pack is returned as one entry, valid
    ones carrying uuid, version, kind, both locations, the owning package, and the completed
    manifest.
91. End to end on an npm workspace, including a pack in the root package.
92. Ordering: entries are ordered by `packageDir` with the root first, and a package's behavior pack
    before its resource pack (`d:entries-ordered-by-package-path`).
93. A package reached twice by the workspace definition reports its packs once.
94. `workspace` defaults to `process.cwd()`.
95. A relative `workspace` resolves against `process.cwd()`.
96. `filter` narrows the returned array, and no `filter` returns the whole set.
97. An empty `filter` returns the whole set — valid and invalid alike
    (`d:filtering-is-a-parameter-of-the-discovery-call`).
98. A `filter` matching nothing returns an empty array.
99. A filtered call returns entries identical to the matching subset of an unfiltered one — the
    filter runs over the built set, so set-wide validation is unchanged by it.
100.  Faults after enumeration never throw: a workspace holding an unreadable manifest, a duplicate
      uuid, and a package with no version returns a set with each fault carried by its entry.
101.  A pack in a directory matched by the workspace patterns but holding no `package.json` appears
      nowhere in the set and raises no problem — the one silence in the set's exhaustiveness.
102.  The call rejects on an unenumerable workspace, with the underlying error unwrapped
      (`d:enumeration-failure-rejects-the-call`).
103.  Two calls read the filesystem again: a manifest changed between calls is reflected in the second
      (`d:the-pack-set-is-read-once-per-call`).
104.  Every invalid entry carries `kind`, `packageName`, `packageDir`, `sourceDir`, and `outputDir`,
      whatever fault it holds (`d:invalid-entries-omit-only-manifest-derived-details`).
105.  An invalid entry carries `uuid`, `version`, and the completed `manifest` whenever those
      survived — an entry invalid only for `duplicate-uuid` carries all three — and an entry invalid
      for `package-version-missing` carries the manifest completed as far as it could be, with
      `header.name` written and `header.version` absent (`r:pack-record-details`).
106.  An entry's `version` is the completed `header.version`, not the source manifest's
      (`d:entry-version-is-the-completed-package-version`).
107.  An entry's `uuid` is lowercased, while the manifest keeps the spelling the source wrote.
108.  Every problem code the kit can report appears in a fixture somewhere in this file, so the closed
      set is exercised end to end (`d:the-problem-code-set-is-closed`).

## Consumer surface (`consumer.test.ts`)

109. The package's public entry point exports `discoverPacks` and each type the spec names, imported
     by package name so the export map is exercised as a consumer meets it
     (`r:dev-kit-provides-a-library`, `r:dev-kit-library-name`).
     109a. Added at the final review gate:

- `package-name-missing` is raised for a nameless package whose manifest is unreadable or is not a
  JSON object, not only for one whose manifest completion could run (`manifest-completion`).
- A `manifest.json` saved with a UTF-8 byte-order mark parses cleanly and raises no problem
  (`pack-locator`), as it does under both package managers' own readers.
- A matched dependency whose depended-on package has no usable version carries no version at all,
  rather than keeping the placeholder the source wrote (`manifest-completion`).
- Each claimant of a duplicated uuid carries its own `claimants` array, so a consumer mutating one
  entry's problem does not reach another's (`pack-validation`).

110. A valid entry's `manifest` is typed `PackManifest`, so `manifest.header.uuid` reads without a
     narrowing cast, while an invalid entry's is `unknown` and does not — the typed manifest is a
     spec commitment, `d:the-completed-manifest-is-reported-as-a-plain-object` being rejected.
