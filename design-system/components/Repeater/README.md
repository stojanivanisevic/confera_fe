# Repeater

Repeating group of fields with add and remove, for co-authors, education levels or reported cases. `min`/`max` limit the rows; the consumer renders the fields of a row.

- Give every item a stable `key`, so that a row keeps its fields when another row is removed.
- When a row is removed, the focus goes to the first control of the row that takes its place (the row before it when the last one was removed), or to the "add" button when no row is left. It never falls back to the page (version 2.0.1).
