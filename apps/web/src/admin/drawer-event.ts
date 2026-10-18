/** A drawer of the admin says it is open: the toasts go to the top meanwhile, off its footer and its buttons (UX3-22). */
export const DRAWER_EVENT = 'confera:drawer';
export const drawerOpened = (open: boolean): void => {
  window.dispatchEvent(new CustomEvent<boolean>(DRAWER_EVENT, { detail: open }));
};
