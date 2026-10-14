# Changelog of the UdEkoM Balkans design system

The design system is released as a whole: tokens, stylesheet, script, types, fonts and previews carry one version. A release is cut with `pnpm ds:release` in `confera_fe`, which records the checksum of every file in `CHECKSUMS.sha256`. Nothing in this folder is changed outside a release.

## 2.3.0 (2026-10-14)

Fixes the design system before the admin screens of Confera 0.2.0 use it: the UI reviewer's re-check of 2.2.0 (section 7 of the 0.1.0 UI review) and the issues M1-ISS-10, 19 to 26, 42, 44 and 45. No colour, radius, shadow or size token of 2.2.0 changed its value; `brand-orange` is still `#ef7b06`. The new tokens are listed below.

### One focus ring everywhere, and a text link (M1-ISS-21, R-02)

- **The blue outline on the three controls that still drew the browser's own ring** (WCAG 2.4.7): the rows-per-page select of Pagination, the links of Breadcrumbs (also in PageHeader and in AppShell's top bar) and the step button of Stepper now draw `2px solid --focus`, offset 2px, as every other control.
- **Sidebar links take the blue outline too** (3.95:1 on `background-dark`). Their orange outline (6.47:1) was kept on purpose in 2.0.0; it was the one exception to "one focus ring", and the README did not name it.
- **New: a text link, `ud-link`.** Underlined, in `ink`, the underline thicker on hover, with the blue focus outline; `ud-link--brand` for a link in `brand-orange-strong` on a light ground (not on the blush `surface-2`). Alert gives the links inside it this style by itself, so the links of an error summary no longer draw the browser's blue (#0000ee, a colour that is no token) and its ring.
- A test walks every focusable part of the gallery in Chromium, Firefox and WebKit and fails on a focus that is not the blue outline or ring (`e2e/ds-2-3-0.spec.ts`); a unit test fails on a focus rule of the stylesheet that draws anything else.

### Targets for a finger (M1-ISS-20)

- **Where the main pointer is a finger** (`@media (pointer: coarse)`, the rule that already made inputs 16px), every control is a target of 44 x 44 px at least (`target-touch`): pill buttons, SegmentedTabs pills, fields, the search, the file button and the small arrow button are 44px high; IconButton (the Menu trigger, the close buttons of Dialog, Drawer, Alert and toast, the menu button of AppShell, the remove button of a Repeater row) and the page buttons are 44 x 44; TextButton (FilterBar's reset, ConfirmDialog's cancel, Repeater's add) and the rows-per-page select are 44px high; the show/hide button of PasswordField and the clear button of SearchField are 44 x 44 at the end of their field; Checkbox, Radio and Switch rows, underline tabs, menu items, list options, sidebar links and the step buttons of Stepper are 44px high; the checkboxes of DataTable and PermissionMatrix, which have no text, are 44 x 44. Glyphs keep their size.
- **Where a part must not move**, its target grows around it: a text link (`ud-link`, links in an Alert) gets padding above and below that does not move its line; the links of NavLink and Breadcrumbs and the sort buttons of DataTable get an invisible layer of 44 x 44 over them. A Tag is 32px high on a touch screen, and its remove button (44 x 44) reaches 6px above and below it, into the gap between rows.
- **With a mouse** the sort buttons of DataTable are targets of 24 x 24 px at least (WCAG 2.5.8), by the same invisible layer; the header row keeps its height.
- Measured in a test with a touch screen in Chromium, Firefox and WebKit, on the gallery and on the hosted form (`e2e/ds-2-3-0.spec.ts`).

### ConfirmDialog, Alert, Toast and DataTable (M1-ISS-26)

- **ConfirmDialog is described as well as named** (WCAG 1.3.1, 4.1.2): its text is tied to the alert dialog by `aria-describedby`, so a screen reader reads the consequence with the question. Dialog takes `aria-describedby` for the same purpose.
- **A dismissed Alert hands the focus on** (WCAG 2.4.3): when the owner removes the alert after its dismiss button was pressed, the focus goes to the next control after it, or to the one before it when the alert was last, instead of falling to the page. An owner that keeps the alert, or puts the focus somewhere itself, is left alone.
- **Links inside an Alert** take the text-link style (above).
- **Toast does not go while it is being read** (WCAG 2.2.1): its time stops while the pointer is on the toasts or the focus is in them, and runs on when both have left. **An error toast stays** until it is dismissed and is announced at once (`role="alert"`); the README says not to use a toast for errors, which belong in an Alert or at the field. A dismissed toast gives the focus back to where it was before it came to the toasts. Before, every toast went after its time, also under the pointer, and the focus fell to the page.
- **DataTable tells "no data yet" from "no results"**: with `filtered` (a search or a filter is set) and no rows it says "No results for these filters" with a button that calls `onClearFilters`; otherwise "Nothing here yet" (or `empty`) with `emptyAction`. **It announces loading**: `loading` marks the table `aria-busy` and fills a status line ("Loading") that is always there, so a screen reader hears it change.
- New label `noResults` ("No results for these filters"; in Confera's Serbian list "Nema rezultata za ove filtere"). New props: DataTable `filtered`, `onClearFilters`, `emptyAction`; Dialog `aria-describedby`.

### DataTable rows by keyboard (M1-ISS-10)

- **A row that opens something is reached by Tab** (WCAG 2.1.1). With `onRowClick`, the cell of `openColumn` (the first column by default) is a button that opens the row, named by the cell's text; Enter and Space open it, and the blue outline shows it. A click anywhere else in the row still opens it. The cell must hold no other control. Before, such rows could be opened with a mouse only ("Known and not changed" since 2.0.0).
- The button looks like the cell's text (underlined on hover) and is a target of 24 x 24 px at least, 44 on a touch screen, without making the row higher. The sort buttons of the header have the same target.

### Card takes a heading level (M1-ISS-23)

- **`headingLevel`** (2 to 6, default 3, as before) sets the level of the card's title, so the outline of a page does not jump from the PageHeader's `h1` to `h3` (WCAG 1.3.1). The title looks the same at every level. Confera's admin home now gives its card `headingLevel={2}`.

### Type, spacing and size tokens (M1-ISS-19)

- **Type styles are tokens.** `pnpm ds:tokens` writes two custom properties for each type style of `tokens.json`: `--text-<style>` (the `font` shorthand: weight, size, line height, family) and `--text-<style>-tracking` (the letter spacing, which the shorthand cannot carry). A rule uses both: `font: var(--text-body-sm); letter-spacing: var(--text-body-sm-tracking);`. 17 styles: the 15 of the Figma file and two Confera additions for the 12px text in Manrope, `body-xs` (12 / 1.35 / 400) and `caption-xs` (12 / 1.2 / 600), both tracked -0.01em.
- **Spacing**: the Figma gutters (`gutter-null` 0, `gutter-xxs` 2, `gutter-xs` 4, `gutter-s` 8) and, as Confera additions on a 4px grid, `gutter-m` 12, `gutter-l` 16, `gutter-xl` 20, `gutter-2xl` 24, `gutter-3xl` 32, `gutter-4xl` 40, `gutter-5xl` 48, `gutter-6xl` 64.
- **Component sizes** in the `size` group, next to `button-height` and the checkbox and radio sizes: `button-padding-x` 30 (measured in Figma), `control-sm` 32, `control-lg` 56, `target-min` 24, `target-touch` 44, `badge-height` 24, `badge-dot` 6, `counter-min` 20, `avatar-sm` 28, `avatar` 36, `avatar-lg` 56, `circle-button` 192, `switch-width` 36, `switch-height` 20, `switch-thumb` 16, `spinner` 24, `spinner-sm` 16, `progress-height` 8, `progress-height-sm` 4, `file-button-height` 36, `textarea-min` 88, `control-min-width` 120, `filter-field-max` 320, `menu-min` 180, `listbox-max` 260, `tooltip-max` 240, `toast-width` 380, `topbar-height` 64, `sidebar-width` 248, `drawer-width` 480, `dialog-sm` 420, `dialog-md` 560, `dialog-lg` 820, `form-card-max` 700, `page-max` 960, `content-max` 1400.
- **Breakpoints** (600, 720 and 900 px) are listed in `tokens.json` under `breakpoint`, for reference: a custom property cannot be used in `@media`, so they stay px, and `tokens.css` names them in a comment.
- **The stylesheet uses them.** `components/bundle.css` writes no font size, line height, padding, margin, gap, inset, width or height in px any more, and no font family but `var(--font-*)`. Written in px on purpose: 1 and 2 px (borders, outlines and the hairline math around them), the widths of thicker borders and rings, shadows, transforms, grid track minimums and flex bases, and the breakpoints.
- **The lint holds it**, in the design system and in the application (`scripts/lint-styles.mjs`, with a planted case each in `lint-fixtures/`): `size-literal` (a px length above 2px in `font`, `font-size`, `line-height`, `letter-spacing`, `padding*`, `margin*`, `scroll-margin*`, `gap`, `inset*`, `top`/`right`/`bottom`/`left`, `width`/`height` and their min and max, and in a custom property of one's own) and `font-literal` (a family that is not `var(--font-*)`, in `font-family` or in the `font` shorthand; the name an `@font-face` declares is not a use).

**Folded to the scale** (each visible in the comparison of 2.2.0 and 2.3.0, `pnpm ds:visual`):
- Type: 11 → 12 (sidebar section title, small avatar); 13 → 12 (switch description, step number, repeater number) or 14 (breadcrumbs, progress label, avatar); 15 → 16 (dialog text, page header description); 18 → 20 (product name in the shell, large avatar). Text that set only a size now has the line height of its style (1.2); running text in descriptions, alerts, tables, lists and dialogs keeps a line height of 1.4 (1.45 in a dialog).
- Spacing: 6 → 4 (badge dot gap, tooltip padding, counter padding) or 8 (text button, dropzone and file list gaps, progress gap, scale ends, page header and step text); 7 → 8 (checkbox and radio gap, sidebar counter); 9 and 10 → 8 or 12 (list, menu and sidebar items, choice lists, switch, underline tabs, file rows, badges, description list rows, step and sidebar gaps); 14 → 12 (alert, toast, repeater row) or 16 (scale button); 28 → 24 (dropzone).
- Sizes: the narrow-screen drawer of AppShell is `sidebar-width` (248, was 264); the selection column of DataTable is `target-touch` wide (44, was 40).

### Previews without real names and addresses (M1-ISS-42)

- The previews brought in with version 1 showed the client's real name and the association's office address (DataTable, Avatar, AppShell) and addresses on real or other domains (Repeater, ToastHost, TextField, FormCard, Dialog). They now show the invented people of Confera's tests (Marta Kovač, Đorđe Šćepanović, Živana Čolić, Lazar Primerić) on `example.test`, and an invented "Univerzitet Primer" instead of real universities (DescriptionList, TextField).
- The AppShell preview shows the logo of the release (`assets/Logos/udekom-mark-on-dark.png`) instead of an address (`/_blob/…`) that existed only where version 1 was authored ("Known and not changed" since 2.0.0).

## 2.2.0 (2026-10-14)

The keyboard, the selected states and the small targets, after the UI and UX reviews of Confera 0.1.0 (UI-M1-01 to 07, 09, 10, 15, 16, 20). No token changed; the brand is the same.

- **Menu and Autocomplete show where the keyboard is** (WCAG 2.4.7, 1.4.11). A focused menu item has the system's blue outline (`2px solid --focus`, inside the item); the active option of a list an inner blue ring. Both were a grey of 1.10:1.
- **Menu gives the focus back.** Escape and a choice return the focus to the button that opened the menu (WCAG 2.4.3); a click elsewhere leaves it where it went. The README said so before it was true.
- **AppShell below 900 px.** The closed drawer is hidden, not only moved off the screen, so its links are out of the tab order. The open drawer behaves as Drawer does: the focus goes into it, Tab stays inside, Escape and the scrim close it, and the focus goes back to the menu button.
- **Tooltip** (WCAG 1.4.13): Escape hides it until the pointer or the focus leaves it, and the pointer can move onto the bubble without it going away.
- **Selected states are not told by colour alone** (WCAG 1.4.11). The chosen pill of SegmentedTabs and the chosen value of ScaleField keep their orange fill and get an inner 2 px `brand-orange-strong` ring (4.71:1 on the page, 5.38:1 on white). The fill alone was 2.45:1.
- **Success fields** draw their border and icon in `success-strong` (5.4:1 on white); `success` was 2.69 to 3.08:1.
- **Checkbox can be required and can say what is wrong.** `required` adds the same " *" as a field and sets `required`; `status="error"` draws the box in `danger` and sets `aria-invalid`; `message` is shown under it and tied by `aria-describedby` (WCAG 3.3.1, 3.3.2). The message is a sibling of the label, so the box is never re-created when a message comes or goes.
- **Targets of 24 x 24 px** (WCAG 2.5.8): the remove button of a Tag and the clear button of SearchField (the glyphs keep their size; the Tag keeps its height). Both, and before them the five controls of UI-M1-15 that had the browser's own ring, now show the system's blue outline.
- **Stepper fits 375 px.** Below 720 px only the current step keeps its width, and its connector no longer runs through its label. The vertical Stepper keeps its connectors at every width (the rule for the horizontal one hid them from 720 px).
- **Corrections to earlier notes.** The header of `components/bundle.css` said every size comes from `tokens.css`: colours and radii do, and the sizes that have a token; the others are written in px (a type and spacing scale in `tokens.css` is planned for 0.2.0). In 2.0.0 the dropzone's border moved from `neutral-500`, not from `control-border` or `neutral-300`.
- `components/bundle.js` carries `@ds-version: 2.2.0` and `Udekom.version` is `"2.2.0"`. `tokens.json` stays at version 2.

## 2.1.0 (2026-10-14)

Two labels have a new name; nothing looks or behaves differently. No token and no stylesheet changed.

- **`showPassword` is now `showPasswordText`, and `hidePassword` is `hidePasswordText`** (the names of the "show" and "hide" button of `PasswordField` in `Udekom.defaultLabels` and `UdekomLabels`). The English texts are the same. Why: Confera's repositories have one rule that a literal text is never bound to a name whose last word is `password`, `secret`, `token` and the like, because that is the only thing by which a secret without a format can be recognised; a label is named so that it cannot be taken for one.
- **The names of 2.0 are still read.** A `labels` list, on a component or on `LabelsProvider`, that gives a text under `showPassword` or `hidePassword` works as before; the new name wins when both are given. The types of the `labels` prop accept the two old names and mark them as deprecated; `UdekomLabels` itself lists the new ones only.
- `components/bundle.js` carries `@ds-version: 2.1.0` and `Udekom.version` is `"2.1.0"`. `tokens.json` stays at version 2.

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
