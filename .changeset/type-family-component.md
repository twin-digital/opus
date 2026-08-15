---
'@twin-digital/minecraft-test-lib': minor
---

`minecraft:type_family` behaves: `getTypeFamilies()` returns the tokens a test seeded on that
entity, in the order supplied, and `hasTypeFamily(token)` answers membership. A family is not an
identifier, so a token takes no `minecraft:` prefix and compares verbatim. The families are the
entity's own — a divergence from the engine, where a type's definition fixes them for every entity
of that type — so two entities sharing a typeId can differ, nothing derives a family from a typeId,
and no table of vanilla families ships.

`addComponent`'s state argument is now shaped by the component it adds: the four attribute numbers
(or their shorthands) on the seven attribute-shaped ids, the family tokens on
`minecraft:type_family`, and no state at all on the other 60. `createEntity` and `createPlayer` take
a `components` map from component id to that state, adding exactly what `addComponent` would.

The entity lookups and `entity.matches` honour `families` and `excludeFamilies` on top of the six
fields they already honoured: `families` keeps an entity carrying every token listed and
`excludeFamilies` drops one carrying any. The remaining sixteen `EntityQueryOptions` fields still
throw `NotImplementedError` naming themselves.
