# UdEkoM Balkans

The design system of the Association of Economists and Managers of the Balkans (UdEkoM Balkans): its website, its conference sites and **Confera**, the conference and membership application. It is built from the Figma redesign of the UdEkoM Balkans website ("UDECOM", synced 2026-10-12). Token notes and component guidelines paraphrase that file.

## Voice and content

- English, plain and warm, written for researchers, professors, students and institutions across the Balkans.
- Headlines state the benefit or the action: "Why become a member?", "Ready to join UdEkoM Balkan?", "Upcoming Events & Workshops".
- Calls to action are short verbs: "Become a member", "Join Now", "Send application", "Read more".
- Forms speak to the person: "Kindly complete all mandatory fields." Hints give the limit: "Biography - up to 300 words", "Max file size: 20mb".
- Write the association's name as **UdEkoM Balkans** in running text. The logo lockup reads "UDEKOM BALKAN".
- Prices carry the currency after the amount: "Regular associate membership - 298 EUR".

## Colour

- **Orange is the brand.** `brand-orange` (#ef7b06) marks the main action, the active state, checked controls and accents: one orange focus per screen. It is a fill, never the colour of text.
- **Ink, not black.** Text and dark buttons use `ink` (#373232). Pure black appears only as `background-dark` (#161616) for the events band and the footer, with `text-on-dark` on it.
- **Warm grounds.** Pages sit on `background` (#f3efec). `background-2` (#fafbfd) alternates sections, `surface-1` (white) holds cards and forms, and `surface-2` (blush) is for soft panels.
- **States.** Errors use `danger` / `danger-strong`, success uses `success` / `success-strong`, and keyboard focus is blue everywhere: the `focus-ring` on fields and choice controls (checkbox, radio, switch, scale), a 2px `focus` outline on every other part (2.3.0: also the rows-per-page select, the Breadcrumbs links, the step buttons of Stepper and the sidebar links, which were the browser's ring or orange).
- **Contrast (version 2, WCAG 2.1 AA).** White on `brand-orange` is 2.80:1 and orange text on `background` 2.45:1, so the orange has three roles with their own tokens:
  - On an orange fill, labels and glyphs are `on-brand` (#17191b): 6.30:1, and 5.16:1 on hover.
  - Orange text, orange icons, checked borders and the "on" track of the switch are `brand-orange-strong` (#a85300): 5.38:1 on `surface-1`, 4.71:1 on `background`. On the blush `surface-2` it reaches 4.05:1 only: no small orange text there.
  - Muted text is `text-secondary`; the border of every control is `neutral-700`. `neutral-500` is for disabled text only.
  - The full table of pairs is in `CHANGELOG.md`.

## Type

- **Manrope** for everything on the site, at a tight -3% letter-spacing (-1% at 12px). The scale is `h1` 48 Bold, `h2` 32 Bold, `metrics` 36 Medium, `h4` 24 SemiBold, `h5` 20 Bold, `h6` 16 SemiBold. Text styles are `body-lg` 20 Medium, `body-md` 16, `body-sm` 14 and `caption` 14 SemiBold, and, as Confera additions for small text, `body-xs` 12 and `caption-xs` 12 SemiBold. Buttons use `button-md` 14 SemiBold and `button-lg` 20 SemiBold.
- **Inter** only inside the input kit: field labels (`field-label`, 14 Bold) and messages (`field-message`, 12 Medium).
- **Every type style is a token** (2.3.0): `tokens.css` has `--text-<style>` (the `font` shorthand: weight, size, line height, family) and `--text-<style>-tracking` (the letter spacing). Write `font: var(--text-body-sm); letter-spacing: var(--text-body-sm-tracking);`; running text that wraps may take a unitless `line-height` of its own (1.4). No size and no family is written by hand: the style lint refuses a px size and a family literal (`size-literal`, `font-literal`).
- Both families are self-hosted since version 2: `fonts/` holds the variable-weight files for Latin and Latin Extended (š č ć ž đ) and `fonts/fonts.css` declares them. A page loads `fonts/fonts.css`, `tokens.css` and `components/bundle.css`, in that order; nothing is requested from another site.
- The Figma file has no H3 style. Use `h4` for third-level headings.

## Shape and layout

- **Round is the motif.** Pill buttons use `radius-pill`, the member CTA and arrow buttons are full circles, and photos sit in circles with an orange orbit arc and a small orange dot. Fields use `radius-field` (12px) and cards use `radius-card` (24px).
- **Rings, not shadows.** Buttons carry a 4px translucent ring of their own colour (`brand-orange-halo`, `ink-halo`), which gets stronger when pressed (`*-halo-strong`). There are no drop shadows in the file; its only shadow is the field `focus-ring`. Confera adds `shadow-overlay` for things that float above the page and `shadow-thumb` for the switch (see Not synced).
- **Spacing** uses the Figma gutters (`gutter-null` 0, `gutter-xxs` 2, `gutter-xs` 4, `gutter-s` 8) inside controls and, as Confera additions on a 4px grid (2.3.0), `gutter-m` 12, `gutter-l` 16, `gutter-xl` 20, `gutter-2xl` 24, `gutter-3xl` 32, `gutter-4xl` 40, `gutter-5xl` 48 and `gutter-6xl` 64. Page layouts in the file use a 1728px canvas with a 1400px content column (`content-max`). Mobile frames are 375px wide with 28px side margins (measured, not tokens).
- **Sizes** of components are tokens in the `size` group (2.3.0): `button-height` 40, `button-padding-x` 30, `control-sm` 32, `target-min` 24, `target-touch` 44, the avatars, the switch, `sidebar-width` 248, `drawer-width` 480, `dialog-sm`/`-md`/`-lg` 420/560/820, `form-card-max` 700, `page-max` 960 and others (`tokens.json`). Only 1 and 2 px stay px (borders, outlines and the hairline math around them), and the breakpoints 600, 720 and 900 px, which `tokens.json` lists for reference because a custom property cannot be used in `@media`.
- Decorative line art ("wave orb", in Assets → Patterns) sits behind sections in orange gradients, never behind text.

## Components

The first set comes from the Figma file:
- **Actions:** Button, CircleButton, ArrowButton.
- **Navigation:** NavLink, SegmentedTabs.
- **Forms:** TextField, Select, Textarea, Checkbox, Radio, Tag, FileButton.
- **Layout:** FormCard.
- **Foundations:** Icon.

The **extended set** was added for Confera on 2026-10-12. It covers what the admin and long forms need, in the spirit of MUI, drawn in this brand's language. The list comes from the controls Stojan's govcore backend serves:
- users with pagination and filters
- roles and permissions
- email servers and the email log
- editable templates
- uploads
- long sectioned forms with numbers, dates, enums and repeating rows
- survey scales
- a city lookup

| Group | Components |
|---|---|
| Actions | TextButton, IconButton |
| Forms | NumberField, DateField, PasswordField, SearchField, Switch, RadioGroup, CheckboxGroup, ScaleField, Autocomplete, FileDropzone |
| Data display | DataTable, StatusBadge, Avatar, Card, DescriptionList, EmptyState, Skeleton, Spinner, Tooltip, ProgressBar |
| Feedback | Alert, ToastHost + `toast()`, Dialog, ConfirmDialog, Drawer |
| Navigation | Pagination, Tabs, Breadcrumbs, Stepper, Menu, SidebarNav |
| Layout | AppShell, PageHeader |
| Patterns | Repeater, PermissionMatrix, FilterBar |

Rules for the extended set:
- **Surfaces.** The admin uses the same warm `background`. Content sits on white `surface-1` cards with `radius-card`, and the sidebar on `background-dark`. Tables live inside a card.
- **Shadows.** The only shadows are on things that float above the page (`shadow-overlay`): dialogs, drawers, menus, listboxes and toasts. Everything else stays flat, as on the site.
- **Status colours.** Status colours come in sets of three: text (`*-strong` or `warning`), surface and border. Orange stays the brand and the "selected" colour. Warnings use amber (`warning`), never the brand orange.
- **Behaviour.** Dialogs, drawers, menus and the narrow-screen drawer of AppShell close on Escape and return the focus to where it came from (menus and AppShell since 2.2.0). While a dialog, a drawer or the AppShell drawer is open the rest of the page is inert, and Tab goes round the open layer in every engine (2.3.0); the AppShell drawer also closes when the view grows past 900px. Tab closes an open menu (2.3.0). A tooltip hides on Escape, stays while the pointer is on it and is kept inside the view (2.3.0). A dismissed Alert hands the focus on; a toast does not go while the pointer or the focus is on it, and an error toast stays (2.3.0). Every focusable part shows the blue `focus` outline or ring (since 2.3.0 without exception; `e2e/ds-2-3-0.spec.ts` walks them all). Tables sort with `aria-sort`, and a row that opens something is reached by Tab (2.3.0). Autocomplete and Tabs follow the ARIA keyboard patterns.
- **Text links (2.3.0).** A link in running text takes the class `ud-link`: underlined, in `ink`, with the blue focus outline (`ud-link--brand` for `brand-orange-strong` on a light ground). Alert gives its links this style by itself.
- **Selected states (2.2.0).** A chosen pill or scale value has an inner `brand-orange-strong` ring as well as the orange fill, so it is not told by colour alone. A toggle button that is on (`aria-pressed`) draws the same ring on the blush surface (2.4.0).
- **Phones (2.4.0).** Below 600px of its own width a DataTable is a card per row (the first column as its title, the other cells as "header: value"); a scroll area that scrolls takes the focus; the AppShell drawer closes when a link in it is chosen, and a skip link leads past the navigation.
- **Text.** Labels and messages follow the Voice section: past-tense confirmations ("Email sent"), errors that say how to fix the problem, and named objects in confirmations ("Delete ITEMA office server?").
- **Built-in texts (version 2).** The few texts a component writes by itself ("Close", "Rows per page", "Remove …") are English by default and can be translated: wrap a page or a form in `LabelsProvider`, or give one component its `labels`. `Udekom.defaultLabels` is the full list.
- **Labels and messages are wired for you (version 2).** A field ties its label and its message to the control without an `id`; groups, the dropzone and the repeater tie their message to the group. Do not repeat this in the page.
- **Touch (version 2).** Where the main pointer is a finger, the controls you type or choose in are 16px, so iOS does not zoom the page on focus, and (2.3.0) every control is a target of 44 x 44 px at least (`target-touch`): buttons, fields and rows grow; a link in a line of text, a link of a trail and a sort button get a target around them that does not move the layout. With a mouse every small control is a target of 24 x 24 px at least (`target-min`, WCAG 2.5.8).

Confera uses these for its embeddable submission and membership forms and for its admin screens. React components are on `window.Udekom`. The class names (`ud-*`) and tokens work without React too.

## Version and release

This is **version 2.4.0** (`CHANGELOG.md` lists every change from version 1). The version is in `tokens.json`, in `components/bundle.js` (`@ds-version`, `Udekom.version`) and in the changelog. `CHECKSUMS.sha256` holds the sha256 of every file of the release. The system is changed only as a release: in the `confera_fe` repository, `pnpm ds:release` records the checksums and `pnpm ds:check` refuses any later change that is not a new release.

To use it as a plain script, load `fonts/fonts.css`, `tokens.css` and `components/bundle.css`, then React and `components/bundle.js`. Nothing is requested from another site.

## Iconography

Line icons from **Lucide** (the Figma names match: mail, alert-circle, check-circle-2, x, check), 2px stroke, drawn in the current text colour, 16px in controls and 18px in toolbars. The Icon component also carries the Lucide icons the admin needs: search, eye, calendar, chevrons, plus, trash, more, file, alert-triangle, menu, users, home, settings, inbox, send, refresh, filter, and since version 2 download, copy, external-link, edit, globe, log-out, user, lock, clock, file-text, credit-card, link. The type `IconName` lists all 45. The footer's social icons (Viber, WhatsApp) and the phone, email and web icons come from other sets in the file and are not part of this system yet.

## Logos

Assets → Logos holds the mark for light grounds, the mark for dark grounds and the horizontal lockup for dark grounds. These are rendered from the Figma file at their drawn size, which is small. Use vector masters for anything larger than the header (see Not synced).

## Not synced

- **Vector logo files (SVG).** Export of SVG from Figma was blocked in this session. The logos here are PNG renders at drawn size: header lockup 120×44, marks 44px and 101px. The light-ground horizontal lockup is missing. Export "Frame 1475" and "Group 2" as SVG from Figma and drop them on the Assets page.
- **Font files.** Stored since version 2 in `fonts/` (SIL Open Font License 1.1, licences included). Only the Latin and Latin Extended subsets and the upright style are included.
- **Dark mode.** The file has one mode. Dark sections are built from `background-dark` and `text-on-dark`, not from a theme.
- **Confera additions.** Status surfaces and borders, `warning`, `info-strong`, the on-dark tints, `scrim`, `shadow-overlay` and `shadow-thumb` are not in the Figma file; nor are (2.3.0) the type styles `body-xs` and `caption-xs`, the gutters from `gutter-m` up and most sizes of the `size` group. Their usage notes say so, and say which sizes were measured in Figma.
- **Exact specs for some components.** The Figma Starter plan's tool-call limit stopped the import after Button, Checkbox and TextField. CircleButton, ArrowButton, NavLink, SegmentedTabs, Radio, Tag, FileButton and FormCard were drawn from screenshots, and their sizes are measured. Re-sync them when the limit resets.
- **Page-level patterns.** Hero with circular photo frames, stat cards, event cards, testimonial slider, footer and the mobile menu are in the Figma file, but not built as components.
- **Name conflict.** `Neutral/900` has two values in the file (#2f3236 in pages, #17191b in the input kit). Both are kept: `neutral-900` and `neutral-950`.
