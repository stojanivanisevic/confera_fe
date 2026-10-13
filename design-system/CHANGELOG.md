# Changelog of the UdEkoM Balkans design system

The design system is released as a whole: tokens, stylesheet, script, types, fonts and previews carry one version. A release is cut with `pnpm ds:release` in `confera_fe`, which records the checksum of every file in `CHECKSUMS.sha256`. Nothing in this folder is changed outside a release.

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
