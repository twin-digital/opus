---
'@twin-digital/refbash': patch
---

support nested model classes in abstract store

Previously, nested class instances would not be made 'observable', preventing reactive
updates when nested data changed. The new `_initializeObservable` implementation
recursively traverses the object graph, making deep observables.
