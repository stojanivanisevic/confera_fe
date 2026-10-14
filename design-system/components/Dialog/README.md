# Dialog

Modal window for a focused task (edit a mail server, assign a reviewer). Traps focus, closes on Escape and backdrop click, returns focus on close.

- Sizes sm, md (default), lg. Put the main action last in `actions`.
- While it is open the rest of the page is inert (2.3.0): the keyboard, a screen reader and the pointer reach the dialog only. Tab goes round its parts in every engine, also when its first or last part is a link (WebKit leaves links out of the Tab order). A dialog opened from another one (a ConfirmDialog in a Drawer) is on top: Escape closes it first.
- `aria-describedby` names the text that describes the dialog (ConfirmDialog sets it to its text).
