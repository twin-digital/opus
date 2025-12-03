---
'@twin-digital/refbash': minor
---

implement light source tracking during delves

- Each light source shows who is carrying it, type, and remaining turns
- As time advances, light durations automatically decrement
- Lights are highlighted when they near expiration (yellow) or have expired (red)
- EventLog entries are created when a light goes out
- Lights can be added via simple form, or removed
