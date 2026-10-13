# DataTable

Table with sortable columns, row selection, loading and empty states, and slots for a toolbar and a footer (Pagination).

- `columns`: `{key, header, sortable, align, width, render(row)}`. Sorting is local unless `manualSort` (then handle `onSortChange` on the server).
- Use it for users, submissions, mail logs, invoices. Put row actions in a Menu in the last column.
