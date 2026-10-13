# SegmentedTabs

Pill tabs that switch between two or three forms of the same content, such as "Individuals" and "Companies/Enterprises" on the application form.

Source: Main Form page; sizes were measured from the screenshot.

- The consumer supplies `options`, the selected `value` and `onChange`.
- Give each option its `content` and the pills are tabs with a panel below them. Without `content` there is no panel to control, and the pills are announced as a radio group: one value out of several, for example the language of a form (version 2).
- Arrow keys, Home and End move the choice; only the chosen pill is in the tab order.
