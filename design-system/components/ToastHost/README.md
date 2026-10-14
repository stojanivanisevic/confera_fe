# ToastHost

Short confirmation that appears in a corner and disappears. Render `<ToastHost/>` once in the app, then call `Udekom.toast({title, description, tone, duration})` from anywhere.

- Say what happened in past tense: "Email sent", "Invoice created".
- A toast goes after `duration` ms (4000 by default; 0 keeps it until dismissed), but never while the pointer is on the toasts or the focus is in them: its time stops and runs on when both have left (2.3.0).
- Do not use a toast for an error: an error is shown where it happened, in an Alert or at the field. An error toast (`tone: "error"`) stays until it is dismissed and is announced at once (2.3.0).
- A dismissed toast gives the focus back to where it was before it came to the toasts.
