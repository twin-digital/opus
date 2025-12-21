---
'@twin-digital/bookify': minor
---

significant improvements to watch behavior

- switched from native watcher to chokidar
- added glob support for all inputs
- correctly rebuild when implicit dependencies change (css @imports, url(...) references, etc.)
