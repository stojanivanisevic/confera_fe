# Changelog of the UdEkoM Balkans design system

The design system is released as a whole: tokens, stylesheet, script, types, fonts and previews carry one version. A release is cut with `pnpm ds:release` in `confera_fe`, which records the checksum of every file in `CHECKSUMS.sha256`. Nothing in this folder is changed outside a release.

## 2.0.1 (2026-10-13)

One accessibility fix in the script; no token, stylesheet or type changed.

- **Repeater: the focus stays in the repeater when a row is removed** (WCAG 2.4.3 Focus Order). The "remove" button of a row disappears with its row, and in 2.0.0 the focus fell back to the page: a keyboard user was thrown to the start of the page (inside a frame, of the form). Now the focus goes to the first control of the row that takes the removed row's place, to the row before it when the last one was removed, and to the "add" button when no row is left. A field is chosen rather than the next "remove" button so that a held-down Enter cannot remove one row after another. The focus is moved only when it really fell back to the page; a page that places it itself is left alone, and so is a repeater whose owner refused the removal.
- `components/bundle.js` carries `@ds-version: 2.0.1` and `Udekom.version` is `"2.0.1"`. `tokens.json` stays at version 2.

## 2.0.0 (2026-10-13)

Version 2 is made by the Confera team (decision ADR-21 of the Confera register). It keeps the form of version 1: one script that puts the components on `window.Udekom`, the `ud-*` class names and the token names. The brand does not change: `brand-orange` is still `#ef7b06`.

### Part 1: tokens, contrast and fonts

**New file**
- `tokens.css`: every token of `tokens.json` as a custom property on `:root`. Version 1 referred to this file and did not ship it. It is generated (`pnpm ds:tokens`), never edited.

**Contrast, WCAG 2.1 AA (decision ADR-22).** Ratios are computed from the token values.

| Token | Change | Used for | Ratio |
|---|---|---|---|
| `on-brand` | new, `#17191b` | Labels and glyphs on orange: primary button, circle button, orange arrow buttons, selected segmented tab, checked checkbox, chosen scale value, finished step, current sidebar link | 6.30 on `brand-orange`, 5.16 on `brand-orange-hover` (white was 2.80 and 3.41) |
| `brand-orange-strong` | new, `#a85300` | Orange text and icons: active and hovered nav link, hovered tab, "add" text button, chosen listbox option, breadcrumb hover, current step number, empty-state icon, outline arrow button. Checked borders: checkbox, radio (ring and dot), chosen scale value. The "on" track of the switch, the progress bar, the spinner arc, the selected underline tab | 5.38 on `surface-1`, 5.20 on `background-2`, 4.71 on `background`; 4.05 on `surface-2`, so no small orange text on the blush ground |
| `danger-hover` | new, `#a82828` | Hover fill of the danger button | white on it 7.00 (white on `danger` was 3.96) |
| `success-strong` | `#13873d` → `#117a37` | Success message, badge and alert icon | 4.88 on `success-surface`, 4.76 on `background` (was 4.13 and 4.03) |

Rules re-pointed in `components/bundle.css` without a new token:
- **Focus of choice controls.** Checkbox, radio, switch and scale take the blue `focus-ring` that fields already had (4.58 on `surface-1`; the orange ring was 2.80).
- **Muted text** moves from `neutral-500` (2.90) and `neutral-700` (4.05) to `text-secondary` (6.45 on `surface-1`): placeholders, field notes, the unit of a number field, "no matches", file sizes, table headers, breadcrumb separators, step numbers. Placeholders also get `opacity: 1`, because one browser dims them.
- **Control borders** move from `control-border` (1.48) and `neutral-300` (1.26) to `neutral-700` (4.05): checkbox, radio, search field, scale, dropzone, the page-size select, and the "off" track of the switch. Icons inside controls (field icon, select chevron, search icon and clear button) move from `neutral-500` to `neutral-700`.
- `neutral-500` remains only as the colour of disabled text. `control-border` is kept as a token for the Figma name and is no longer used.

Not changed, on purpose: `brand-orange` as a fill, the halo rings, the dot of the brand badge, the connector line of finished steps and the ring of the current step (decorative next to a text or glyph that passes), and the orange focus outline of sidebar links, which sits on `background-dark` (6.47).

**Fonts**
- `components/bundle.css` no longer imports Manrope and Inter from Google Fonts; it imports nothing.
- New folder `fonts/`: Manrope and Inter as variable-weight WOFF2 files, Latin and Latin Extended (š č ć ž đ), with `fonts.css` and both licences (SIL Open Font License 1.1). A page loads `fonts/fonts.css`, `tokens.css` and `components/bundle.css`; no request goes to another site. The files are copied unchanged from `@fontsource-variable/manrope` 5.3.0 and `@fontsource-variable/inter` 5.3.0 (`pnpm ds:fonts`).

**Version**
- `tokens.json`: `"version": 2`. The usage notes of the changed and affected tokens are rewritten.

### Part 2: types, icons, labels, accessibility, touch

**Complete types (`components/index.d.ts`)**
- `IconName` lists all 45 icons (version 1 listed 11 of 33) and is exported; props that took `IconName | string` take `IconName`.
- `ButtonProps.variant` includes `"danger"`, which the script and the stylesheet already had.
- New: `UdekomLabels`, `LabelsProviderProps`, `defaultLabels`, `version`; a `labels` prop on every component that writes a text of its own; `className` where the script already accepted it; `content` on the options of SegmentedTabs.

**Icons.** 12 added, with the paths of Lucide 1.56.0 (ISC licence): `download`, `copy`, `external-link`, `edit` (Lucide "pencil"), `globe`, `log-out`, `user`, `lock`, `clock`, `file-text`, `credit-card`, `link`.

**Translatable labels.** No fixed English text remains in a component (version 1 had 36).
- The texts are in one list, `DEFAULT_LABELS` (English, exported as `Udekom.defaultLabels`): previous, next, remove, removeItem, chooseFile, showPassword, hidePassword, search, clearSearch, noMatches, dropFiles, uploading, loading, selectAllRows, selectRow, nothingHere, pagination, pageRange, rowsPerPage, previousPage, nextPage, dismiss, close, cancel, confirm, working, breadcrumb, moreActions, mainNavigation, openNavigation, removeRow, addRow, permission, rolePermission, clearFilters.
- New component `LabelsProvider` translates them for everything inside it; every component that writes such a text also takes `labels`. A text prop a component already had (`label`, `buttonText`, `title`, `noOptionsText`, `confirmText`, `cancelText`, `addLabel`, `removeLabel`, `resetLabel`) still wins.
- Labels are plain strings with parts in braces (`"Remove {name}"`, `"{from}–{to} of {total}"`), so they can be passed from a server-rendered page.

**Accessibility defects fixed**

| Defect in version 1 | Version 2 |
|---|---|
| Label and `aria-describedby` were wired only if an `id` was passed | Every field control gets an id (the one passed, or a generated one): TextField, Select, Textarea, NumberField, DateField, PasswordField, Autocomplete. The label points at it and the message describes it. A caller's own `aria-describedby` is kept |
| Group messages were not tied to their group | RadioGroup and ScaleField are a `fieldset` with the role `radiogroup`, named by the legend and described by the message, with `aria-required` and `aria-invalid`; CheckboxGroup is described by its message. The inner element no longer repeats the role |
| Dropzone label, hint and message were not tied to the drop area | The drop area is named by label and title and described by hint and message; the wrapper is a named group. Same for FileButton (label, file name and hint are tied to the file input), Switch (the description describes the switch) and Repeater (a named group described by its message) |
| SegmentedTabs was a tab list without panels | Options with `content` give tabs with a panel (`aria-controls`, `aria-labelledby`). Without `content` the pills are a radio group, which is what a choice without panels is. Arrow keys, Home and End move the choice; only the chosen pill is in the tab order |
| Tabs pointed at a panel that was not there | A tab has `aria-controls` only when it is selected and has content; the panel is named by its tab. Menu and Autocomplete point at their list only while it is open |
| The tab panel took focus without showing it | Tab panels show the blue focus outline |
| Autocomplete's list had no name, and "No matches" was not an option | The list is named by the field's label; the empty line is a disabled option |
| On narrow screens the text of the steps was removed, so a finished step that is a button had no name | The text is hidden from sight only; assistive technology still reads it |
| Inputs were 14px, which makes iOS zoom on focus | `@media (pointer: coarse)`: field, search and page-size controls are 16px. With a mouse they stay 14px |

**Version in the script.** `components/bundle.js` carries `/* @ds-version: 2.0.0 */` and `Udekom.version`. The manifest on line 1 gains `LabelsProvider` (53 components).

**Previews and READMEs.** Icon shows all icons; SegmentedTabs shows both forms; new `LabelsProvider`; the READMEs of Button, TextField, SegmentedTabs, Icon, FileDropzone and Tabs describe the changes.

### Known and not changed
- The AppShell preview shows its logo by an address (`/_blob/…`) that exists only where the design system was authored. The preview is as in version 1.
- DataTable sorts text with the Serbian collation (`"sr"`) whatever the page language; rows that react to a click are not reachable by keyboard. Neither was in the list of version 2.
- `text-field` and `control-border` are tokens no rule uses.
