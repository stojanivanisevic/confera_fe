// @confera/form-renderer: forms as authors see them, hosted and embedded.
// In 0.1.0 it holds the spike form of M1-FE-04 and the pieces the real
// renderer of 0.3.0 keeps: fields that are plain controls read through a store
// (what is typed before the form is attached survives), the draft storage that
// survives a browser that refuses storage, the typed text catalogues and the word count.
export { EmbeddedForm, HostedForm } from './FormPage';
export type { EmbeddedFormProps, HostedFormProps } from './FormPage';
export { SpikeForm } from './SpikeForm';
export type { SpikeFormProps } from './SpikeForm';
export { createFormValueStore, readControls, useFormRef, useFormValues } from './form-values';
export type { FormValues, FormValueStore } from './form-values';
export { createDraftStorage, draftStorage } from './safe-storage';
export type { DraftStorage } from './safe-storage';
export { countWords, fill, FORM_LANGUAGES, SPIKE_FORM_TEXTS } from './texts';
export type { FormLanguage, SpikeFormTexts } from './texts';
