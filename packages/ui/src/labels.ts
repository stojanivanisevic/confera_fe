import type { UdekomLabels } from './generated/udekom.client';

/**
 * Serbian (Latin script) for every text the design-system components write by
 * themselves. The English texts are the design system's own defaults
 * (`defaultLabels`). The type makes the list complete: a new label in the
 * design system is a type error here until it is translated (ADR-23).
 *
 *   <LabelsProvider labels={LABELS_SR}> … </LabelsProvider>
 */
export const LABELS_SR: UdekomLabels = {
  previous: 'Prethodno',
  next: 'Sledeće',
  remove: 'Ukloni',
  removeItem: 'Ukloni {name}',
  chooseFile: 'Izaberite fajl',
  showPassword: 'Prikaži lozinku',
  hidePassword: 'Sakrij lozinku',
  search: 'Pretraga',
  clearSearch: 'Obriši pretragu',
  noMatches: 'Nema rezultata',
  dropFiles: 'Prevucite fajlove ovde ili kliknite da ih izaberete',
  uploading: 'Otprema se {name}',
  loading: 'Učitavanje',
  selectAllRows: 'Izaberi sve redove',
  selectRow: 'Izaberi red',
  nothingHere: 'Još nema ničega',
  pagination: 'Stranice',
  pageRange: '{from}–{to} od {total}',
  rowsPerPage: 'Redova po strani',
  previousPage: 'Prethodna strana',
  nextPage: 'Sledeća strana',
  dismiss: 'Zatvori poruku',
  close: 'Zatvori',
  cancel: 'Otkaži',
  confirm: 'Potvrdi',
  working: 'U toku',
  breadcrumb: 'Putanja',
  moreActions: 'Još radnji',
  mainNavigation: 'Glavna navigacija',
  openNavigation: 'Otvori navigaciju',
  removeRow: 'Ukloni {index}',
  addRow: 'Dodaj red',
  permission: 'Dozvola',
  rolePermission: '{role}: {permission}',
  clearFilters: 'Poništi filtere',
};
