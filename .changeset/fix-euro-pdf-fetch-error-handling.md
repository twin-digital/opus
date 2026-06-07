---
'@twin-digital/bookify': patch
---

fix(bookify): check fetch `response.ok` in the EuroPDF renderer and throw an error with the HTTP status and response body (without leaking the API key) on failure
