# ConfirmDialog

Small alert dialog to confirm an action that cannot be undone. `destructive` turns the confirm button red.

- Name the object and the consequence: "Delete ITEMA office server? Emails using it will switch to the fallback server."
- The dialog is named by its title and described by its text (`aria-describedby`, 2.3.0), so a screen reader reads the consequence with the question. The focus starts on Cancel.
