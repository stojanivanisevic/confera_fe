# DateField

Date input on the browser's native picker.

- Store dates as ISO `YYYY-MM-DD`; show them to people as `DD.MM.YYYY`.
- One calendar icon (2.3.0): the browser's own picker button, at the end of the field in Chromium and Firefox, which opens the picker by pointer and by keyboard. The field draws no icon of its own (2.2.0 drew one at the start, so Chromium showed two); Safari opens its picker from the field. An `icon` you pass is still drawn.
