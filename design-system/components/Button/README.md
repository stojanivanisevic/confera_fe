# Button

Pill button for actions: orange for the main action on a screen, dark for secondary actions.

Source: Figma "Button Orange" and "Button Black" (40px high, 30px side padding, 4px translucent ring, Button_md text).

- Use one orange button per view for the action that moves the person forward ("Send application", "Become a member").
- Use the dark button for navigation-like actions ("Conferences", "Read more").
- States: hover and pressed use `brand-orange-hover` / `ink-hover`; pressed also strengthens the ring; disabled is the hover colour at 60% opacity.
- The consumer supplies the label (`children`), an optional Lucide icon name (`icon`, `iconPosition`) and normal button props.

- `variant="danger"` is the red button for an action that destroys something ("Delete"); it is used by ConfirmDialog.

> Version 2: the label on the orange button is `on-brand` (#17191b), 6.30:1 on `brand-orange` and 5.16:1 on hover. White on the orange was 2.80:1.
