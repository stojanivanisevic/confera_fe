# Drawer

Panel that slides over from the side for details or a filter set, keeping the list visible behind it.

- It is modal as Dialog is: the focus goes into it and stays inside, the page behind is inert, Escape, the close button and the scrim close it, and the focus goes back to where it came from (2.3.0 for the inert page and the Tab order in WebKit).
- While its body is longer than the drawer, the body takes the focus (blue outline) and is a region named by the title, so the keyboard can scroll it (2.4.0, WCAG 2.1.1).
