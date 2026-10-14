# Alert

Inline message in the page: info, success, warning, error. Use for states that persist (a closed form, a failed SMTP check) and for every error. For short confirmations use toast.

- Links inside an alert take the text-link style (`ud-link`): underlined, in ink, with the blue focus outline (2.3.0).
- With `onClose` the alert has a dismiss button. When the owner removes the alert, the focus goes on to the next control after it (the one before it when it was last), not back to the start of the page (2.3.0).
