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

- **Orange is the brand.** `brand-orange` marks the main action, the active state, checked controls and accents: one orange focus per screen.
- **Ink, not black.** Text and dark buttons use `ink` (#373232). Pure black appears only as `background-dark` (#161616) for the events band and the footer, with `text-on-dark` on it.
- **Warm grounds.** Pages sit on `background` (#f3efec). `background-2` (#fafbfd) alternates sections, `surface-1` (white) holds cards and forms, and `surface-2` (blush) is for soft panels.
- **States.** Errors use `danger` / `danger-strong`, success uses `success` / `success-strong`, and keyboard focus on fields uses the blue `focus` ring.
- **Contrast notes.** White text on `brand-orange` (buttons) is about 2.9:1, and orange text on `background` is about 2.6:1. Both are below WCAG AA for small text. Keep orange text for 24px+ headings and icons, keep button labels short, and review this before public launch of Confera.

## Type

- **Manrope** for everything on the site, at a tight -3% letter-spacing. The scale is `h1` 48 Bold, `h2` 32 Bold, `metrics` 36 Medium, `h4` 24 SemiBold, `h5` 20 Bold, `h6` 16 SemiBold. Text styles are `body-lg` 20 Medium, `body-md` 16, `body-sm` 14 and `caption` 14 SemiBold. Buttons use `button-md` 14 SemiBold and `button-lg` 20 SemiBold.
- **Inter** only inside the input kit: field labels (`field-label`, 14 Bold) and messages (`field-message`, 12 Medium).
- Both families load from Google Fonts. `components/bundle.css` imports them, so a page that loads `bundle.css` gets them.
- The Figma file has no H3 style. Use `h4` for third-level headings.

## Shape and layout

- **Round is the motif.** Pill buttons use `radius-pill`, the member CTA and arrow buttons are full circles, and photos sit in circles with an orange orbit arc and a small orange dot. Fields use `radius-field` (12px) and cards use `radius-card` (24px).
- **Rings, not shadows.** Buttons carry a 4px translucent ring of their own colour (`brand-orange-halo`, `ink-halo`), which gets stronger when pressed (`*-halo-strong`). There are no drop shadows in the file. The only shadow token is the field `focus-ring`.
- **Spacing** uses the Figma gutters (`gutter-xxs` 2, `gutter-xs` 4, `gutter-s` 8) inside controls. Page layouts in the file use a 1728px canvas with a 1400px content column. Mobile frames are 375px wide with 28px side margins (measured, not tokens).
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
- **Behaviour.** Dialogs, drawers and menus close on Escape and return focus. Tables sort with `aria-sort`. Autocomplete and Tabs follow the ARIA keyboard patterns.
- **Text.** Labels and messages follow the Voice section: past-tense confirmations ("Email sent"), errors that say how to fix the problem, and named objects in confirmations ("Delete ITEMA office server?").

Confera uses these for its embeddable submission and membership forms and for its admin screens. React components are on `window.Udekom`. The class names (`ud-*`) and tokens work without React too.

## Iconography

Line icons from **Lucide** (the Figma names match: mail, alert-circle, check-circle-2, x, check), 2px stroke, drawn in the current text colour, 16px in controls and 18px in toolbars. The Icon component also carries the Lucide icons the admin needs: search, eye, calendar, chevrons, plus, trash, more, file, alert-triangle, menu, users, home, settings, inbox, send, refresh, filter. The footer's social icons (Viber, WhatsApp) and the phone, email and web icons come from other sets in the file and are not part of this system yet.

## Logos

Assets → Logos holds the mark for light grounds, the mark for dark grounds and the horizontal lockup for dark grounds. These are rendered from the Figma file at their drawn size, which is small. Use vector masters for anything larger than the header (see Not synced).

## Not synced

- **Vector logo files (SVG).** Export of SVG from Figma was blocked in this session. The logos here are PNG renders at drawn size: header lockup 120×44, marks 44px and 101px. The light-ground horizontal lockup is missing. Export "Frame 1475" and "Group 2" as SVG from Figma and drop them on the Assets page.
- **Font files.** Manrope and Inter are Google Fonts. No files are stored.
- **Dark mode.** The file has one mode. Dark sections are built from `background-dark` and `text-on-dark`, not from a theme.
- **Confera additions.** Status surfaces and borders, `warning`, `info-strong`, the on-dark tints, `scrim`, `shadow-overlay` and `shadow-thumb` are not in the Figma file. Their usage notes say so.
- **Exact specs for some components.** The Figma Starter plan's tool-call limit stopped the import after Button, Checkbox and TextField. CircleButton, ArrowButton, NavLink, SegmentedTabs, Radio, Tag, FileButton and FormCard were drawn from screenshots, and their sizes are measured. Re-sync them when the limit resets.
- **Page-level patterns.** Hero with circular photo frames, stat cards, event cards, testimonial slider, footer and the mobile menu are in the Figma file, but not built as components.
- **Name conflict.** `Neutral/900` has two values in the file (#2f3236 in pages, #17191b in the input kit). Both are kept: `neutral-900` and `neutral-950`.
