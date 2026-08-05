---
'@twin-digital/design-process': minor
---

Products are discovered by scanning `products/` at any depth, so they can be grouped into
subfolders: a `product.yaml` or `product.yml` declares a product wherever it sits, its directory
name is the id, and duplicate ids are a validator finding.

Adds two commands. `design-process increment <product>` is a terminal session that rules a draft's
proposed decisions and open questions from a master list beside the selected entry's full text,
stages the rulings, and lands the draft once nothing is open. `design-process land <product>` runs
the same landing non-interactively: conflicts, the rename into the number, the design check,
commit, push, approve, and auto-merge, stopping at the first failure. The approving token is typed
at the terminal and held only in memory.

`design-process show`'s coverage summary now counts adopted preset requirements and excludes
proposed decisions, matching what the record validator enforces.
