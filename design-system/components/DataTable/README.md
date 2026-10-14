# DataTable

Table with sortable columns, row selection, loading and empty states, and slots for a toolbar and a footer (Pagination).

- `columns`: `{key, header, sortable, align, width, render(row)}`. Sorting is local unless `manualSort` (then handle `onSortChange` on the server). With a mouse a sort button is a target of 24 x 24 px at least.
- Use it for users, submissions, mail logs, invoices. Put row actions in a Menu in the last column.
- **Rows that open something (2.3.0).** With `onRowClick`, the cell of `openColumn` (the first column by default) is a button named by its text: Tab reaches it, Enter or Space opens the row, and a click anywhere in the row opens it too. That cell must hold no other control (no link, no menu).
- **Two empty states (2.3.0).** Without rows and without filters the table says "Nothing here yet" (or shows `empty`), with `emptyAction` under it ("Invite a user"). With `filtered` (a search or a filter is set) it says "No results for these filters", with a button that calls `onClearFilters`.
- **Loading (2.3.0).** `loading` shows skeleton rows, marks the table `aria-busy` and says "Loading" in a status line that a screen reader hears.
