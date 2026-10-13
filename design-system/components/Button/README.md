# Button

Pill button for actions: orange for the main action on a screen, dark for secondary actions.

Source: Figma "Button Orange" and "Button Black" (40px high, 30px side padding, 4px translucent ring, Button_md text).

- Use one orange button per view for the action that moves the person forward ("Send application", "Become a member").
- Use the dark button for navigation-like actions ("Conferences", "Read more").
- States: hover and pressed use `brand-orange-hover` / `ink-hover`; pressed also strengthens the ring; disabled is the hover colour at 60% opacity.
- The consumer supplies the label (`children`), an optional Lucide icon name (`icon`, `iconPosition`) and normal button props.

> White 14px text on `brand-orange` measures about 2.9:1, below WCAG AA 4.5:1. This is the design as drawn; keep labels short and bold, and consider `ink` text if accessibility review requires it.
