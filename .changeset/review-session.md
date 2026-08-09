---
'@twin-digital/design-process': minor
---

The ratify session becomes a review session, rendering `/design-process/ratify-screen@3`.

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
