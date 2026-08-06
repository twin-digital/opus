---
'@twin-digital/design-process': patch
---

The ratify session's frame now fits its viewport. No row runs past the terminal's width — the
header, the detail pane's own rows, and the composed rows are all clipped — so the frame no longer
soft-wraps, outgrow the rows it was drawn for, and scroll the screen out from under the repaint.

The footer is rendered, carrying what the last refused action said. The entry list scrolls to keep
the selected entry inside the pane, and the detail pane's scroll stops at the end of the entry
rather than paging past it into a blank pane.
