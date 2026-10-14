// UdEkoM Balkans components, version 2: window.Udekom.<Name>
// The types refer to the React namespace of @types/react.

/** Every icon the Icon component can draw (Lucide names). */
export type IconName =
  | "mail" | "alert-circle" | "check-circle-2" | "check" | "x" | "chevron-down" | "arrow-left" | "arrow-right" | "arrow-up-right" | "upload" | "info"
  | "search" | "eye" | "eye-off" | "calendar" | "chevron-up" | "chevron-left" | "chevron-right" | "chevrons-up-down" | "plus" | "trash" | "more" | "file"
  | "alert-triangle" | "menu" | "users" | "home" | "settings" | "inbox" | "send" | "refresh" | "filter" | "minus"
  | "download" | "copy" | "external-link" | "edit" | "globe" | "log-out" | "user" | "lock" | "clock" | "file-text" | "credit-card" | "link";
export type FieldStatus = "default" | "error" | "success";

/**
 * Every text a component writes by itself. The defaults are English (`Udekom.defaultLabels`).
 * Translate them for a subtree with `<LabelsProvider labels={...}>`, or for one component with
 * its `labels` prop. A part in braces is filled in by the component.
 */
export interface UdekomLabels {
  previous: string; next: string;
  remove: string; /** {name} */ removeItem: string;
  chooseFile: string;
  showPasswordText: string; hidePasswordText: string;
  search: string; clearSearch: string;
  noMatches: string;
  dropFiles: string;
  /** {name} */ uploading: string;
  loading: string;
  selectAllRows: string; selectRow: string;
  nothingHere: string;
  pagination: string; /** {from} {to} {total} */ pageRange: string; rowsPerPage: string; previousPage: string; nextPage: string;
  dismiss: string; close: string;
  cancel: string; confirm: string; working: string;
  breadcrumb: string; moreActions: string; mainNavigation: string; openNavigation: string;
  /** {index} */ removeRow: string; addRow: string;
  permission: string; /** {role} {permission} */ rolePermission: string;
  clearFilters: string;
}
/** The names two labels had in version 2.0. A list of labels that still uses them is understood. */
interface RenamedLabels {
  /** @deprecated Use `showPasswordText`. */ showPassword?: string;
  /** @deprecated Use `hidePasswordText`. */ hidePassword?: string;
}
/** Components that write a text of their own take this. */
interface WithLabels { labels?: Partial<UdekomLabels> & RenamedLabels; }
export interface LabelsProviderProps { labels: Partial<UdekomLabels> & RenamedLabels; children?: React.ReactNode; }
export declare const defaultLabels: Readonly<UdekomLabels>;
/** Version of the design system, for example "2.0.0". */
export declare const version: string;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Orange main action, dark secondary action, or red destructive action. Default "primary". */
  variant?: "primary" | "dark" | "danger";
  icon?: IconName;
  iconPosition?: "start" | "end";
}
export interface CircleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Diameter, e.g. "192px" (default). */
  size?: string;
  /** Rotate the label as in the design. Default true. */
  tilt?: boolean;
}
export interface ArrowButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, WithLabels {
  variant?: "outline" | "outline-orange" | "orange" | "white";
  direction?: "left" | "right" | "up-right";
  size?: "md" | "sm";
  /** Accessible name; defaults to Previous / Next. */
  label?: string;
}
export interface NavLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  active?: boolean;
  current?: boolean;
}
export interface SegmentedTabsProps {
  /** With `content` the pills are tabs with a panel; without, they are a radio group. */
  options: Array<string | { value: string; label: string; content?: React.ReactNode }>;
  value: string;
  onChange?: (value: string) => void;
  /** Accessible name of the group. */
  label?: string;
  className?: string;
}
interface FieldBase {
  /** The label is tied to the control, and the message describes it, with or without an `id`. */
  label?: string;
  message?: string;
  status?: FieldStatus;
  icon?: IconName;
  required?: boolean;
}
export interface TextFieldProps extends FieldBase, React.InputHTMLAttributes<HTMLInputElement> {}
export interface SelectProps extends FieldBase, React.SelectHTMLAttributes<HTMLSelectElement> {
  options: Array<string | { value: string; label: string }>;
  placeholder?: string;
}
export interface TextareaProps extends FieldBase, React.TextareaHTMLAttributes<HTMLTextAreaElement> {}
export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  /** Marks the box with " *" and sets `required` (2.2.0). */
  required?: boolean;
  /** "error" draws the box in the danger colour and sets aria-invalid (2.2.0). */
  status?: FieldStatus;
  /** Shown under the box and tied to it by aria-describedby (2.2.0). */
  message?: React.ReactNode;
}
export interface RadioProps extends React.InputHTMLAttributes<HTMLInputElement> { label?: React.ReactNode; }
export interface TagProps extends WithLabels { children: React.ReactNode; onRemove?: () => void; className?: string; }
export interface FileButtonProps extends React.InputHTMLAttributes<HTMLInputElement>, WithLabels {
  label?: string;
  hint?: string;
  fileName?: string;
  buttonText?: string;
}
export interface FormCardProps { title?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string; }
export interface IconProps { name: IconName; size?: number; strokeWidth?: number; title?: string; className?: string; }

// ---------- Extended set (Confera admin and long forms) ----------
type Option = string | { value: string; label: string; disabled?: boolean };
type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

export interface TextButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { icon?: IconName; tone?: "default" | "danger"; }
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { icon: IconName; /** Accessible name and tooltip. */ label: string; size?: number; }
export interface NumberFieldProps extends TextFieldProps { unit?: string; }
export interface DateFieldProps extends TextFieldProps {}
export interface PasswordFieldProps extends TextFieldProps, WithLabels {}
export interface SearchFieldProps extends React.InputHTMLAttributes<HTMLInputElement>, WithLabels { label?: string; onClear?: () => void; }
export interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> { label: React.ReactNode; description?: React.ReactNode; }
interface GroupBase { className?: string; label?: string; /** Tied to the group as its description. */ message?: string; status?: FieldStatus; required?: boolean; disabled?: boolean; options: Option[]; direction?: "column" | "row"; name?: string; }
export interface RadioGroupProps extends GroupBase { value?: string; defaultValue?: string; onChange?: (value: string) => void; }
export interface CheckboxGroupProps extends GroupBase { value?: string[]; defaultValue?: string[]; onChange?: (value: string[]) => void; }
export interface ScaleFieldProps extends Omit<GroupBase, "options"> { options?: Option[]; value?: string; defaultValue?: string; onChange?: (value: string) => void; minLabel?: string; maxLabel?: string; }
export interface AutocompleteProps extends FieldBase, WithLabels { id?: string; className?: string; options: Option[]; multiple?: boolean; value?: string | string[]; defaultValue?: string | string[]; onChange?: (value: string | string[]) => void; placeholder?: string; disabled?: boolean; limit?: number; noOptionsText?: string; }
export interface FileItem { name: string; size?: number; /** 0–100 while uploading. */ progress?: number; }
export interface FileDropzoneProps extends WithLabels { className?: string; label?: string; title?: string; hint?: string; /** Tied to the drop area as its description. */ message?: string; status?: FieldStatus; required?: boolean; multiple?: boolean; accept?: string; files?: FileItem[]; onFiles?: (files: File[]) => void; onRemove?: (index: number) => void; }

export interface DataTableColumn<T = any> { key: string; header: React.ReactNode; sortable?: boolean; align?: "left" | "center" | "right"; width?: string | number; render?: (row: T) => React.ReactNode; }
export interface DataTableProps<T = any> extends WithLabels {
  className?: string;
  columns: DataTableColumn<T>[]; rows: T[]; rowKey?: string; caption?: string;
  sort?: { key: string; direction: "asc" | "desc" } | null; defaultSort?: { key: string; direction: "asc" | "desc" }; onSortChange?: (s: { key: string; direction: "asc" | "desc" } | null) => void; manualSort?: boolean;
  selectable?: boolean; selected?: Array<string | number>; onSelectionChange?: (ids: Array<string | number>) => void;
  loading?: boolean; empty?: React.ReactNode; toolbar?: React.ReactNode; footer?: React.ReactNode; onRowClick?: (row: T) => void;
}
export interface PaginationProps extends WithLabels { className?: string; page: number; pageSize: number; total: number; onPageChange?: (page: number) => void; pageSizeOptions?: number[]; onPageSizeChange?: (size: number) => void; }
export interface StatusBadgeProps { tone?: Tone; dot?: boolean; children: React.ReactNode; }
export interface AvatarProps { name?: string; src?: string; size?: "sm" | "md" | "lg"; }
export interface CardProps extends React.HTMLAttributes<HTMLElement> { title?: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; padding?: "default" | "none"; }
export interface DescriptionListProps { items: Array<{ label: React.ReactNode; value?: React.ReactNode }>; columns?: 1 | 2; }
export interface EmptyStateProps { title: React.ReactNode; description?: React.ReactNode; icon?: IconName; action?: React.ReactNode; }
export interface SkeletonProps { lines?: number; variant?: "text" | "circle"; width?: string | number; height?: string | number; size?: number; }
export interface SpinnerProps extends WithLabels { size?: "sm" | "md"; label?: string; }
export interface TooltipProps { title: React.ReactNode; placement?: "top" | "bottom"; children: React.ReactElement; }
export interface ProgressBarProps { value: number; label?: string; showLabel?: boolean; size?: "sm" | "md"; }

export interface AlertProps extends WithLabels { className?: string; tone?: "info" | "success" | "warning" | "error"; title?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; onClose?: () => void; }
export interface ToastOptions { title: string; description?: string; tone?: "info" | "success" | "warning" | "error"; /** ms; 0 keeps it until dismissed. Default 4000. */ duration?: number; }
/** Render once; then call toast(). */
export interface ToastHostProps extends WithLabels { position?: "bottom" | "top"; }
export declare function toast(opts: ToastOptions | string): number;
export interface DialogProps extends WithLabels { className?: string; open: boolean; onClose?: () => void; title: React.ReactNode; actions?: React.ReactNode; size?: "sm" | "md" | "lg"; dismissible?: boolean; role?: "dialog" | "alertdialog"; children?: React.ReactNode; }
export interface ConfirmDialogProps extends WithLabels { open: boolean; title: React.ReactNode; children?: React.ReactNode; confirmText?: string; cancelText?: string; destructive?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void; }
export interface DrawerProps extends WithLabels { className?: string; open: boolean; onClose: () => void; title: React.ReactNode; actions?: React.ReactNode; side?: "right" | "left"; width?: string; children?: React.ReactNode; }

export interface TabsProps { className?: string; items: Array<{ value: string; label: React.ReactNode; count?: number; content?: React.ReactNode }>; value?: string; defaultValue?: string; onChange?: (value: string) => void; label?: string; }
export interface BreadcrumbsProps extends WithLabels { className?: string; items: Array<{ label: React.ReactNode; href?: string; onClick?: () => void }>; }
export interface StepperProps { steps: Array<{ label: React.ReactNode; description?: React.ReactNode }>; current: number; orientation?: "horizontal" | "vertical"; onStepClick?: (index: number) => void; }
export interface MenuProps extends WithLabels { className?: string; items: Array<{ label?: React.ReactNode; icon?: IconName; onSelect?: () => void; danger?: boolean; disabled?: boolean; divider?: boolean }>; trigger?: React.ReactElement; label?: string; align?: "end" | "start"; }
export interface SidebarNavItem { value: string; label: React.ReactNode; icon?: IconName; href?: string; badge?: React.ReactNode; }
export interface SidebarNavProps extends WithLabels { className?: string; items?: SidebarNavItem[]; sections?: Array<{ title?: string; items: SidebarNavItem[] }>; value?: string; onNavigate?: (value: string, item: SidebarNavItem) => void; label?: string; }
export interface AppShellProps extends WithLabels { className?: string; logo?: React.ReactNode; product?: React.ReactNode; sidebar: React.ReactNode; topbar?: React.ReactNode; children: React.ReactNode; }
export interface PageHeaderProps { title: React.ReactNode; description?: React.ReactNode; breadcrumbs?: BreadcrumbsProps["items"]; actions?: React.ReactNode; }

export interface RepeaterProps<T = any> extends WithLabels { className?: string; items: T[]; onChange: (items: T[]) => void; renderRow: (item: T, index: number, update: (patch: Partial<T>) => void) => React.ReactNode; newItem?: () => Partial<T>; min?: number; max?: number; label?: string; addLabel?: string; /** The row number is added after it. */ removeLabel?: string; /** Tied to the group as its description. */ message?: string; }
export interface PermissionMatrixProps extends WithLabels { className?: string; roles: Array<{ id: string; name: string; locked?: boolean }>; permissions: Array<{ name: string; label?: string; description?: string }>; value: Record<string, string[]>; onChange?: (value: Record<string, string[]>) => void; disabled?: boolean; }
export interface FilterBarProps extends WithLabels { className?: string; children: React.ReactNode; onReset?: () => void; resetLabel?: string; actions?: React.ReactNode; }
