'use client';

// One scenario per component of the design system. The same scenarios are
// rendered by the gallery page (/dev/gallery, test builds only), by the
// render-and-hydrate tests and by the accessibility scan, so every component
// of the manifest is exercised (M1-FE-02, M1-FE-03, M1-FE-06).
//
// People and organisations are invented; addresses are on example.test (NFR-PRIV-05).
import { useState, type FC, type ReactNode } from 'react';

import { ICON_NAMES, type ComponentName } from '../generated/manifest';
import * as U from '../generated/udekom.client';
import { LABELS_SR } from '../labels';
import styles from './gallery.module.css';

export interface ScenarioProps {
  /** Overlays (dialog, confirm dialog, drawer) start open. The isolated render tests use it. */
  initialOpen?: boolean;
}

const Row = ({ children }: { children: ReactNode }) => <div className={styles.row}>{children}</div>;
const Stack = ({ children }: { children: ReactNode }) => <div className={styles.stack}>{children}</div>;
const Grid = ({ children }: { children: ReactNode }) => <div className={styles.grid}>{children}</div>;

interface Person {
  id: number;
  name: string;
  email: string;
  institution: string;
  status: 'Accepted' | 'In review' | 'Rejected';
}
const PEOPLE: Person[] = [
  { id: 1, name: 'Đorđe Šćepanović', email: 'djordje@example.test', institution: 'Univerzitet Primer', status: 'Accepted' },
  { id: 2, name: 'Živana Čolić', email: 'zivana@example.test', institution: 'Institut Uzor', status: 'In review' },
  { id: 3, name: 'Marta Kovač', email: 'marta@example.test', institution: 'Fakultet Ogled', status: 'Rejected' },
];
const TONE = { Accepted: 'success', 'In review': 'info', Rejected: 'danger' } as const;
const COUNTRIES = ['Serbia', 'Montenegro', 'Croatia', 'Slovenia', 'North Macedonia'];

const NAV: NonNullable<U.SidebarNavProps['sections']> = [
  { title: 'Conference', items: [
    { value: 'submissions', label: 'Submissions', icon: 'inbox', badge: 12 },
    { value: 'reviews', label: 'Reviews', icon: 'users' },
  ] },
  { title: 'Organisation', items: [{ value: 'settings', label: 'Settings', icon: 'settings' }] },
];

export const SCENARIOS: Record<ComponentName, FC<ScenarioProps>> = {
  Button: () => (
    <Row>
      <U.Button>Send application</U.Button>
      <U.Button variant="dark">Read more</U.Button>
      <U.Button variant="danger">Delete</U.Button>
      <U.Button icon="arrow-right" iconPosition="end">Next step</U.Button>
      <U.Button disabled>Saving</U.Button>
    </Row>
  ),

  CircleButton: () => <U.CircleButton size="150px">Become a member</U.CircleButton>,

  ArrowButton: () => (
    <Row>
      <U.ArrowButton direction="left" />
      <U.ArrowButton />
      <U.ArrowButton variant="outline-orange" direction="up-right" label="Open the conference" />
      <U.ArrowButton variant="orange" label="Next event" />
      <U.ArrowButton variant="white" size="sm" label="Next photo" />
    </Row>
  ),

  NavLink: () => (
    <Row>
      <U.NavLink href="#conferences" current>Conferences</U.NavLink>
      <U.NavLink href="#journal" active>Journal</U.NavLink>
      <U.NavLink href="#membership">Membership</U.NavLink>
    </Row>
  ),

  SegmentedTabs: function SegmentedTabsScenario() {
    const [kind, setKind] = useState('individuals');
    const [language, setLanguage] = useState('en');
    return (
      <Stack>
        <U.SegmentedTabs
          label="Applicant"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'individuals', label: 'Individuals', content: <p className={styles.text}>Membership for one person.</p> },
            { value: 'companies', label: 'Companies', content: <p className={styles.text}>Membership for an institution.</p> },
          ]}
        />
        <U.SegmentedTabs label="Language" value={language} onChange={setLanguage} options={[{ value: 'en', label: 'English' }, { value: 'sr', label: 'Srpski' }]} />
      </Stack>
    );
  },

  TextField: () => (
    <Grid>
      <U.TextField label="First and last name" placeholder="Write your first and last name" required />
      <U.TextField label="Email address" icon="mail" defaultValue="marta@example.test" message="We send the confirmation here" />
      <U.TextField label="Phone number" defaultValue="+381 62" status="error" message="Enter a full phone number" />
      <U.TextField label="Workplace" defaultValue="Univerzitet Primer" status="success" message="Looks good" />
      <U.TextField label="Occupation" defaultValue="Researcher" disabled />
    </Grid>
  ),

  Select: () => (
    <Grid>
      <U.Select label="Country" placeholder="Choose a country" defaultValue="" options={COUNTRIES} required />
      <U.Select label="Presentation" defaultValue="onsite" options={[{ value: 'onsite', label: 'On site' }, { value: 'online', label: 'Online' }]} message="You can change it until the deadline" />
      <U.Select label="Category" defaultValue="" placeholder="Choose a category" options={['Regular', 'Student']} status="error" message="Choose a category" />
    </Grid>
  ),

  Textarea: () => (
    <Grid>
      <U.Textarea label="Abstract" placeholder="Up to 300 words" message="0 of 300 words" />
      <U.Textarea label="Biography" defaultValue="Too short." status="error" message="Write at least 50 words" />
    </Grid>
  ),

  Checkbox: function CheckboxScenario() {
    const [on, setOn] = useState(true);
    return (
      <Stack>
        <U.Checkbox label="I am the corresponding author" checked={on} onChange={() => setOn(!on)} />
        <U.Checkbox label="Send me news about the conference" defaultChecked={false} />
        <U.Checkbox label="Membership fee paid" defaultChecked disabled />
      </Stack>
    );
  },

  Radio: () => (
    <Row>
      <U.Radio name="gallery-radio" value="onsite" label="On site" defaultChecked />
      <U.Radio name="gallery-radio" value="online" label="Online" />
      <U.Radio name="gallery-radio" value="poster" label="Poster" disabled />
    </Row>
  ),

  Tag: function TagScenario() {
    const [tags, setTags] = useState(['Economics', 'Management', 'Tourism']);
    return (
      <Row>
        {tags.map((tag) => (
          <U.Tag key={tag} onRemove={() => setTags(tags.filter((t) => t !== tag))}>{tag}</U.Tag>
        ))}
        <U.Tag>Fixed</U.Tag>
      </Row>
    );
  },

  FileButton: () => (
    <Stack>
      <U.FileButton label="Photo" hint="Max file size: 20 MB" accept="image/png,image/jpeg" required />
      <U.FileButton label="Full paper" fileName="kovac-full-paper.docx" hint="Word document" buttonText="Replace file" />
    </Stack>
  ),

  FormCard: () => (
    <U.FormCard
      title="Kindly complete all mandatory fields."
      actions={<><U.Button>Send application</U.Button><U.Button variant="dark">Save draft</U.Button></>}
    >
      <U.TextField label="First and last name" required />
      <U.TextField label="Email address" icon="mail" required />
    </U.FormCard>
  ),

  Icon: () => (
    <div className={styles.icons}>
      {ICON_NAMES.map((name) => (
        <span key={name} className={styles.icon}>
          <U.Icon name={name} size={20} />
          <span>{name}</span>
        </span>
      ))}
      <span className={styles.icon}>
        <U.Icon name="check-circle-2" size={20} title="Paid" />
        <span>with a title</span>
      </span>
    </div>
  ),

  TextButton: () => (
    <Row>
      <U.TextButton icon="refresh">Refresh</U.TextButton>
      <U.TextButton tone="danger" icon="trash">Remove</U.TextButton>
      <U.TextButton disabled>Export</U.TextButton>
    </Row>
  ),

  IconButton: () => (
    <Row>
      <U.IconButton icon="settings" label="Settings" />
      <U.IconButton icon="trash" label="Delete submission" />
      <U.IconButton icon="more" label="More actions" size={20} />
    </Row>
  ),

  NumberField: () => (
    <Grid>
      <U.NumberField label="Regular fee" unit="EUR" defaultValue={298} min={0} />
      <U.NumberField label="Exchange rate" defaultValue={117.2} step={0.0001} status="error" message="The rate is outside the allowed range" />
    </Grid>
  ),

  DateField: () => (
    <Grid>
      <U.DateField label="Abstract deadline" defaultValue="2026-12-01" />
      <U.DateField label="Conference start" defaultValue="" message="Local time of the conference" />
    </Grid>
  ),

  PasswordField: () => (
    <Grid>
      <U.PasswordField label="Password" autoComplete="new-password" defaultValue="" message="At least 12 characters" />
    </Grid>
  ),

  SearchField: function SearchFieldScenario() {
    const [query, setQuery] = useState('Kovač');
    return (
      <Grid>
        <U.SearchField label="Search submissions" placeholder="Name, title or reference" value={query} onChange={(e) => setQuery(e.target.value)} onClear={() => setQuery('')} />
      </Grid>
    );
  },

  Switch: function SwitchScenario() {
    const [on, setOn] = useState(true);
    return (
      <Stack>
        <U.Switch label="Form is open" description="Authors can submit until the deadline" checked={on} onChange={() => setOn(!on)} />
        <U.Switch label="Require a photo" defaultChecked={false} />
        <U.Switch label="Online payment" description="Needs a PayPal account" disabled />
      </Stack>
    );
  },

  RadioGroup: function RadioGroupScenario() {
    const [value, setValue] = useState('regular');
    return (
      <Grid>
        <U.RadioGroup label="Fee category" value={value} onChange={setValue} options={[{ value: 'regular', label: 'Regular' }, { value: 'student', label: 'Student' }, { value: 'listener', label: 'Listener', disabled: true }]} message="The category decides the fee" required />
        <U.RadioGroup label="Presentation" direction="row" options={['On site', 'Online']} status="error" message="Choose how you will present" />
      </Grid>
    );
  },

  CheckboxGroup: () => (
    <Grid>
      <U.CheckboxGroup label="Topics" defaultValue={['economics']} options={[{ value: 'economics', label: 'Economics' }, { value: 'management', label: 'Management' }, { value: 'tourism', label: 'Tourism' }]} message="Choose up to three" />
      <U.CheckboxGroup label="Consent" options={['I accept the publication terms']} status="error" message="The consent is required" required />
    </Grid>
  ),

  ScaleField: function ScaleFieldScenario() {
    const [value, setValue] = useState('4');
    return <U.ScaleField label="Originality of the paper" value={value} onChange={setValue} minLabel="Poor" maxLabel="Excellent" message="1 is the lowest grade" />;
  },

  Autocomplete: () => (
    <Grid>
      <U.Autocomplete label="Country" placeholder="Start typing" options={COUNTRIES} defaultValue="Serbia" />
      <U.Autocomplete label="Keywords" multiple options={['Economics', 'Management', 'Tourism', 'Finance']} defaultValue={['Economics', 'Finance']} message="Choose up to five" />
    </Grid>
  ),

  FileDropzone: function FileDropzoneScenario() {
    const [files, setFiles] = useState<U.FileItem[]>([
      { name: 'kovac-abstract.docx', size: 482_113 },
      { name: 'kovac-figures.pdf', size: 2_340_112, progress: 60 },
    ]);
    return (
      <U.FileDropzone
        label="Paper files"
        hint="Word or PDF, up to 20 MB each"
        message="Upload the abstract and the figures"
        multiple
        files={files}
        onFiles={(added) => setFiles([...files, ...added.map((f) => ({ name: f.name, size: f.size }))])}
        onRemove={(index) => setFiles(files.filter((_, i) => i !== index))}
        required
      />
    );
  },

  DataTable: function DataTableScenario() {
    const [selected, setSelected] = useState<Array<string | number>>([2]);
    const [query, setQuery] = useState('');
    const [opened, setOpened] = useState('');
    const rows = PEOPLE.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()));
    return (
      <>
        <U.DataTable<Person>
          caption="Submissions"
          rows={rows}
          toolbar={<U.SearchField label="Search authors" placeholder="Search authors" value={query} onChange={(e) => setQuery(e.target.value)} onClear={() => setQuery('')} />}
          filtered={query.trim() !== ''}
          onClearFilters={() => setQuery('')}
          onRowClick={(row) => setOpened(row.name)}
          selectable
          selected={selected}
          onSelectionChange={setSelected}
          defaultSort={{ key: 'name', direction: 'asc' }}
          columns={[
            { key: 'name', header: 'Author', sortable: true },
            { key: 'email', header: 'Email' },
            { key: 'institution', header: 'Institution', sortable: true },
            { key: 'status', header: 'Status', render: (row) => <U.StatusBadge tone={TONE[row.status]}>{row.status}</U.StatusBadge> },
          ]}
          footer={<U.Pagination page={1} pageSize={10} total={3} />}
        />
        <p className={styles.text} role="status">{opened ? `Opened the submission of ${opened}` : ''}</p>
      </>
    );
  },

  Pagination: function PaginationScenario() {
    const [page, setPage] = useState(3);
    const [size, setSize] = useState(25);
    return <U.Pagination page={page} pageSize={size} total={240} onPageChange={setPage} pageSizeOptions={[10, 25, 50]} onPageSizeChange={setSize} />;
  },

  StatusBadge: () => (
    <Row>
      <U.StatusBadge>Draft</U.StatusBadge>
      <U.StatusBadge tone="brand">Selected</U.StatusBadge>
      <U.StatusBadge tone="success">Paid</U.StatusBadge>
      <U.StatusBadge tone="warning">Waiting for payment</U.StatusBadge>
      <U.StatusBadge tone="danger">Rejected</U.StatusBadge>
      <U.StatusBadge tone="info" dot={false}>In review</U.StatusBadge>
    </Row>
  ),

  Avatar: () => (
    <Row>
      <U.Avatar name="Đorđe Šćepanović" size="sm" />
      <U.Avatar name="Živana Čolić" />
      <U.Avatar name="Marta Kovač" size="lg" />
    </Row>
  ),

  Card: () => (
    <U.Card title="Fees" subtitle="ITEMA 2026" actions={<U.TextButton icon="plus">Add fee</U.TextButton>}>
      <p className={styles.text}>Regular participation: 298 EUR.</p>
    </U.Card>
  ),

  DescriptionList: () => (
    <U.DescriptionList
      columns={2}
      items={[
        { label: 'Reference', value: 'ITEMA-2026-0042' },
        { label: 'Corresponding author', value: 'Marta Kovač' },
        { label: 'Institution', value: 'Fakultet Ogled' },
        { label: 'Phone' },
      ]}
    />
  ),

  EmptyState: () => (
    <U.EmptyState title="No submissions yet" description="Submissions appear here as soon as the first author sends the form." action={<U.Button>Copy the form link</U.Button>} />
  ),

  Skeleton: () => (
    <Stack>
      <U.Skeleton lines={3} />
      <U.Skeleton variant="circle" size={48} />
    </Stack>
  ),

  Spinner: () => (
    <Row>
      <U.Spinner label="Loading submissions" />
      <U.Spinner size="sm" label="Saving" />
    </Row>
  ),

  Tooltip: () => (
    <Row>
      <U.Tooltip title="Copies the snippet for the conference site">
        <button type="button" className="ud-text-btn">Copy snippet</button>
      </U.Tooltip>
      <U.Tooltip title="Shown below" placement="bottom">
        <button type="button" className="ud-text-btn">Help</button>
      </U.Tooltip>
    </Row>
  ),

  ProgressBar: () => (
    <Stack>
      <U.ProgressBar value={64} label="Uploading kovac-figures.pdf" showLabel />
      <U.ProgressBar value={30} label="Import progress" size="sm" />
    </Stack>
  ),

  Alert: function AlertScenario() {
    const [shown, setShown] = useState(true);
    return (
      <Stack>
        <U.Alert tone="info" title="The form closes on 1 December">
          Authors see the deadline in the form. <a href="#deadline">Change the deadline</a>
        </U.Alert>
        <U.Alert tone="success" title="Email sent">The confirmation went to marta@example.test.</U.Alert>
        <U.Alert tone="warning" title="The send limit is close" action={<U.TextButton>Review</U.TextButton>}>28 of 30 confirmation emails this hour.</U.Alert>
        {shown ? <U.Alert tone="error" title="The file was not uploaded" onClose={() => setShown(false)}>The file is larger than 20 MB.</U.Alert> : null}
      </Stack>
    );
  },

  ToastHost: () => (
    <Row>
      <U.ToastHost />
      <U.Button variant="dark" onClick={() => U.toast({ title: 'Email sent', description: 'To marta@example.test', tone: 'success', duration: 0 })}>Show a toast</U.Button>
      <U.Button variant="dark" onClick={() => U.toast({ title: 'Draft saved', tone: 'info', duration: 1500 })}>Show a short toast</U.Button>
      <U.Button variant="dark" onClick={() => U.toast({ title: 'The server did not answer', tone: 'error', duration: 1500 })}>Show an error toast</U.Button>
    </Row>
  ),

  Dialog: function DialogScenario({ initialOpen = false }) {
    const [open, setOpen] = useState(initialOpen);
    return (
      <Row>
        <U.Button variant="dark" onClick={() => setOpen(true)}>Open the dialog</U.Button>
        <U.Dialog open={open} onClose={() => setOpen(false)} title="Send the decision" actions={<U.Button onClick={() => setOpen(false)}>Send email</U.Button>}>
          <U.TextField label="Subject" defaultValue="Your abstract was accepted" />
        </U.Dialog>
      </Row>
    );
  },

  ConfirmDialog: function ConfirmDialogScenario({ initialOpen = false }) {
    const [open, setOpen] = useState(initialOpen);
    return (
      <Row>
        <U.Button variant="danger" onClick={() => setOpen(true)}>Delete the mail server</U.Button>
        <U.ConfirmDialog open={open} title="Delete ITEMA office server?" confirmText="Delete" destructive onConfirm={() => setOpen(false)} onCancel={() => setOpen(false)}>
          Emails already sent stay in the log.
        </U.ConfirmDialog>
      </Row>
    );
  },

  Drawer: function DrawerScenario({ initialOpen = false }) {
    const [open, setOpen] = useState(initialOpen);
    return (
      <Row>
        <U.Button variant="dark" onClick={() => setOpen(true)}>Open the drawer</U.Button>
        <U.Drawer open={open} onClose={() => setOpen(false)} title="Submission ITEMA-2026-0042" actions={<U.Button onClick={() => setOpen(false)}>Done</U.Button>}>
          <U.DescriptionList items={[{ label: 'Author', value: 'Marta Kovač' }, { label: 'Status', value: 'In review' }]} />
        </U.Drawer>
      </Row>
    );
  },

  Tabs: () => (
    <U.Tabs
      label="Submission"
      items={[
        { value: 'data', label: 'Data', content: <p className={styles.text}>Title, authors and abstract.</p> },
        { value: 'files', label: 'Files', count: 2, content: <p className={styles.text}>Two files.</p> },
        { value: 'history', label: 'History', content: <p className={styles.text}>Every change of status.</p> },
      ]}
    />
  ),

  Breadcrumbs: () => <U.Breadcrumbs items={[{ label: 'Conferences', href: '#conferences' }, { label: 'ITEMA 2026', href: '#itema' }, { label: 'Submissions' }]} />,

  Stepper: () => (
    <Stack>
      <U.Stepper current={1} steps={[{ label: 'Abstract', description: 'Accepted' }, { label: 'Full paper', description: 'Due 15 January' }, { label: 'Payment' }]} onStepClick={() => undefined} />
      <U.Stepper orientation="vertical" current={2} steps={[{ label: 'Proforma issued' }, { label: 'Payment received' }, { label: 'Invoice issued' }]} />
    </Stack>
  ),

  Menu: () => (
    <Row>
      <U.Menu
        label="Row actions"
        align="start"
        items={[
          { label: 'Open', icon: 'eye' },
          { label: 'Resend the email', icon: 'send' },
          { divider: true },
          { label: 'Delete', icon: 'trash', danger: true },
          { label: 'Archive', disabled: true },
        ]}
      />
    </Row>
  ),

  SidebarNav: function SidebarNavScenario() {
    const [value, setValue] = useState('submissions');
    return (
      <div className={styles.dark}>
        <U.SidebarNav label="Conference" value={value} onNavigate={setValue} sections={NAV} />
      </div>
    );
  },

  AppShell: () => (
    <div className={styles.shell}>
      <U.AppShell
        product="Confera"
        sidebar={<U.SidebarNav label="Main" value="submissions" sections={NAV} />}
        topbar={<U.Breadcrumbs items={[{ label: 'ITEMA 2026', href: '#itema' }, { label: 'Submissions' }]} />}
      >
        <U.PageHeader title="Submissions" description="Everything authors sent for this conference." />
      </U.AppShell>
    </div>
  ),

  PageHeader: () => (
    <U.PageHeader
      title="Conference settings"
      description="Deadlines, fees and the sites that may show the forms."
      breadcrumbs={[{ label: 'Conferences', href: '#conferences' }, { label: 'ITEMA 2026' }]}
      actions={<U.Button>Save changes</U.Button>}
    />
  ),

  Repeater: function RepeaterScenario() {
    const [authors, setAuthors] = useState([{ key: 1, name: 'Marta Kovač' }, { key: 2, name: 'Đorđe Šćepanović' }]);
    return (
      <U.Repeater<{ key: number; name: string }>
        label="Authors"
        items={authors}
        onChange={setAuthors}
        min={1}
        max={6}
        addLabel="Add author"
        removeLabel="Remove author"
        message="The first author is the corresponding author"
        renderRow={(author, index, update) => (
          <U.TextField label={`Name of author ${index + 1}`} value={author.name} onChange={(e) => update({ name: e.target.value })} />
        )}
      />
    );
  },

  PermissionMatrix: function PermissionMatrixScenario() {
    const [value, setValue] = useState<Record<string, string[]>>({ admin: ['submissions.read'], reviewer: ['reviews.write'] });
    return (
      <U.PermissionMatrix
        roles={[{ id: 'admin', name: 'Admin', locked: true }, { id: 'reviewer', name: 'Reviewer' }]}
        permissions={[
          { name: 'submissions.read', label: 'Read submissions', description: 'All submissions of the conference' },
          { name: 'reviews.write', label: 'Write reviews' },
        ]}
        value={value}
        onChange={setValue}
      />
    );
  },

  LabelsProvider: () => (
    <U.LabelsProvider labels={LABELS_SR}>
      <div lang="sr">
        <Stack>
          <U.Pagination page={2} pageSize={10} total={48} pageSizeOptions={[10, 25]} />
          <U.FileButton label="Fotografija" hint="Najviše 20 MB" />
          <U.Alert tone="info" title="Prijava je sačuvana" onClose={() => undefined}>Poruka o potvrdi je poslata.</U.Alert>
        </Stack>
      </div>
    </U.LabelsProvider>
  ),

  FilterBar: function FilterBarScenario() {
    const [query, setQuery] = useState('');
    return (
      <U.FilterBar onReset={() => setQuery('')} actions={<U.Button variant="dark" icon="filter">Apply</U.Button>}>
        <U.SearchField label="Search" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
        <U.Select label="Status" defaultValue="all" options={[{ value: 'all', label: 'All statuses' }, { value: 'accepted', label: 'Accepted' }]} />
      </U.FilterBar>
    );
  },
};

/** Components whose scenario opens an overlay; the tests also render them open. */
export const OVERLAY_SCENARIOS: readonly ComponentName[] = ['Dialog', 'ConfirmDialog', 'Drawer'];
