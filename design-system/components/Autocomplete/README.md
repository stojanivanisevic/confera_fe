# Autocomplete

Combobox that filters a list as you type. With `multiple`, chosen values show as Tags in the field.

- Keyboard: arrows move, Enter picks, Escape closes, Backspace removes the last tag.
- On focus the chosen value stays in the field, selected, so typing replaces it; the list shows every option, the chosen one active, until you type (2.3.0; it emptied the field).
- The chevron of a multiple Autocomplete stays at the right of the field however the tags wrap, and a press anywhere in the field's box puts the focus in it (2.3.0).
- For long server-side lists, filter on the server and pass the current `options`.
