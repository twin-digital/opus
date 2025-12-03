---
'@twin-digital/dolmenwood': minor
---

add mobx observability to all models

We were applying this indirectly in the store layer. However, this was introducing various bugs where models were not
observable when expected. While this adds the mobx dependency to our model, it greatly increases reliability in the UI.
