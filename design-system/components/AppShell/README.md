# AppShell

Layout of the Confera admin: dark sidebar with the logo, a top bar and the content area. Below 900px the sidebar becomes a drawer opened from the menu button.

- Closed, the drawer is hidden: its links are out of the tab order (2.2.0).
- Open, it is a modal dialog named "Navigation", with a visible close button (2.3.0). The focus goes into it and Tab stays inside, in every engine; the page behind is inert, so neither the keyboard nor a screen reader nor a finger reaches it. Escape, the close button and the scrim close it, and the focus goes back to the menu button.
- When the view grows past 900px while the drawer is open (a phone turned, a browser widened), the drawer closes and the page is given back: it scrolls again and Tab reaches the content (2.3.0).
