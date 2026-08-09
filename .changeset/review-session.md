---
'@twin-digital/design-process': minor
---

The ratify session becomes a review session, rendering `/design-process/ratify-screen@4`.

- The session opens on every draft its pull request carries, whatever statuses that draft's
  entries hold.
- A requirements list sits beside the decisions list, carrying the requirements the draft
  declares and its model bindings. An entry there takes a note and no ruling, and a
  requirement's pane carries its rationale and its verification steps.
- Either list marks what an entry closes and what closed it.
- A submit returns the owner to the list it was made from with the staged set cleared of what
  it wrote; the sitting ends when the owner ends it or a landing completes.
- A refused push fetches the branch's tip, reapplies the sitting's rulings by entry id, and
  pushes again, leaving an entry the tip already ruled as the tip has it.
- The header holds two rows whatever it carries, and the detail pane reflows a statement to its
  width and wraps every block it renders, a list item's continuation hanging under its text.
- Each list ends with the foundations the draft retires in the source it reads, the row carrying
  the retired foundation's title over its id with `retired` where a ruling stands, and the pane
  carrying that foundation's statement recovered from the fold at head beside the retirement's
  reason.
- The detail pane marks its edge while it holds content back, and a page moves by the pane's own
  height and stops at the content's first and last row, so the whole of an entry's detail is
  reachable.
