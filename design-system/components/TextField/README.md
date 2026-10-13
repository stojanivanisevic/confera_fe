# TextField

Single-line input with label, optional icon, status icon and message line.

Source: Figma "Input Group" and the input kit (Text column: default, error, success; empty, filled, focused, disabled).

- Field: 40px high, 12px radius, 1px `neutral-700` border, 8px padding. Focus shows the blue `focus-ring`.
- `status="error"` gives a red border, an alert icon and the message in `danger-strong`; `status="success"` a green border and check icon.
- Labels use Inter Bold 14 (`field-label`), messages Inter Medium 12 (`field-message`).
- Mark required fields with `required`; the label then shows an asterisk.
