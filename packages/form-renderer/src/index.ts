// @confera/form-renderer: forms as authors see them, hosted and embedded (ADR-09).
// A published form definition becomes the fields of the design system; its rules are checked by
// the interpreter of ./rules in the browser and again by the API; the fields are plain controls
// read through a store (what is typed before the form is attached survives); the draft is kept in
// the tab and survives a browser that refuses storage; the texts are typed catalogues (ADR-23).
export { EmbeddedForm, HostedForm } from './FormPage';
export type { EmbeddedFormProps, HostedFormProps } from './FormPage';
export { answersOf, controlName, fieldId, FormRenderer } from './FormRenderer';
export type { FormRendererProps } from './FormRenderer';
export { DefinitionError, FIELD_KINDS, PATTERNS, readDefinition, readPublishedForm, textOf } from './definition';
export type { Bilingual, Condition, FieldDefinition, FieldKind, FormDefinition, FormState, PublishedForm, SectionDefinition } from './definition';
export { createFormValueStore, readControls, useFormRef, useFormValues } from './form-values';
export type { FormValues, FormValueStore } from './form-values';
export { createDraftStorage, draftStorage } from './safe-storage';
export type { DraftStorage } from './safe-storage';
export { countOf, fill, FORM_LANGUAGES, FORM_TEXTS, FORM_TYPES, isFormLanguage, plural } from './i18n/catalogue';
export type { FormCatalogue, FormLanguage, FormType } from './i18n/catalogue';
export { dayInZone, formatAmount, formatBytes, formatDate, formatDateTime, formatNumber, LOCALES, zoneName } from './i18n/format';
export { browserLanguages, pickLanguage } from './i18n/language';
export { countWords, isEmailAddress, pluralOf, validate, wordsOver } from './rules';
export type { Answers, RuleError } from './rules';
export { messageFor } from './messages';
export { safeHref, textParts } from './safe-text';
