# IconButton

Round 32px icon-only button for toolbars and table rows; 44 x 44 on a touch screen (2.3.0).

- `label` is required: it becomes the accessible name and the native `title`. A browser shows a title to a mouse only, after a while; a keyboard or a finger never sees it. Where the name must be seen, wrap the button in a Tooltip.
- **A toggle (2.4.0).** With `aria-pressed`, a button that is on draws the ring of a chosen pill (`brand-orange-strong`) on the blush surface, so the state is seen, not only read (WCAG 1.4.1). The same holds for a Button with `aria-pressed`. Use it for a toolbar: Bold, Italic, a list.
