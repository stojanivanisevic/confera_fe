# LabelsProvider

Translates every text the components write by themselves ("Close", "Rows per page", "Remove …", "Drop files here or click to choose", …) for everything inside it. Added in version 2.

- `labels` is a partial list: what is missing stays English. The full list with the English defaults is `Udekom.defaultLabels`; its type is `UdekomLabels`.
- A part in braces is filled in by the component: `removeItem: "Ukloni {name}"`, `pageRange: "{from}–{to} od {total}"`.
- One component can be translated on its own with its `labels` prop. A text prop of the component (`label`, `buttonText`, `confirmText`, `addLabel`, …) still wins over both.
- Texts are plain strings, so they can be passed from a server-rendered page.
