---
'@twin-digital/repo-kit': minor
---

change design so that feature config is provided by users

Previously, there was one set of opinionated features baked into the library. Now,
the repo must include a '.repo-kit.yml' file (with configurable path). This YAML
file specifies the sets of features, and also which packages they apply to.
