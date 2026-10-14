# Tooltip

Short dark hint shown on hover and keyboard focus. Escape hides it until the pointer or the focus leaves; the pointer can move onto the bubble without it going away (WCAG 1.4.13, 2.2.0). Only for supplementary text; never hide required information in it.

- The bubble is kept inside the view (2.3.0): near an edge of a phone it moves sideways, 8px from the edge, and without room on its side of the trigger (`placement`, top by default) it goes to the other side. A parent that clips its content (`overflow: hidden`) still clips the bubble: give such a trigger room.
