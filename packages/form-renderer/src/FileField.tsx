'use client';

/**
 * A file field of a form (M3-FE-04; FR-FORM-10, FR-FILE-01): the design system's FileDropzone,
 * one file, uploaded at once with its progress, and refused before the upload when its type or its
 * size is outside the field's rule, with a message in the form's language that states the limit.
 * The API checks again, by content (ADR-10), and its refusal says the same words. A file is never
 * kept in the draft (D3).
 */
import { useEffect, useRef } from 'react';

import { FileDropzone } from '@confera/ui';

import type { FileRule, FileType } from './definition';
import { fill, FORM_TEXTS, type FormLanguage } from './i18n/catalogue';
import { formatBytes } from './i18n/format';
import { PublicApiError, type Uploaded } from './public-api';

export interface FileState {
  readonly name: string;
  readonly size: number;
  /** 0–100 while uploading. */
  readonly progress?: number;
  /** Why it was refused, in the form's language at the time. */
  readonly error?: { readonly code: string; readonly maxBytes?: number };
  /** The upload's id once it is on the server. */
  readonly uploadId?: string;
}

export const extensionOf = (name: string): string => (/\.([a-z0-9]{1,8})$/i.exec(name)?.[1] ?? '').toLowerCase();

/** The file-name extensions of a file type: the browser's first check; the API detects the type from the content. */
const EXTENSIONS: Readonly<Record<FileType, readonly string[]>> = { pdf: ['pdf'], docx: ['docx'], doc: ['doc'], jpeg: ['jpg', 'jpeg'], png: ['png'] };
export const extensionsOf = (rule: FileRule): string[] => rule.accept.flatMap((type) => EXTENSIONS[type]);
/** The types as a person reads them: ".pdf, .docx, .doc". */
export const typesText = (rule: FileRule): string => rule.accept.map((type) => `.${EXTENSIONS[type][0] ?? type}`).join(', ');

/** The check before the upload: type by the name's extension and the size (the API checks the content). */
export function checkFile(file: { name: string; size: number }, rule: FileRule): FileState['error'] | null {
  if (file.size === 0) return { code: 'file_empty' };
  if (!extensionsOf(rule).includes(extensionOf(file.name))) return { code: 'file_type' };
  if (file.size > rule.maxBytes) return { code: 'file_too_large', maxBytes: rule.maxBytes };
  return null;
}

/** The message of a refused file. */
export function fileMessage(state: FileState, rule: FileRule, language: FormLanguage): string {
  const t = FORM_TEXTS[language].files;
  const types = typesText(rule);
  switch (state.error?.code) {
    case 'file_too_large':
      return fill(t.tooLarge, { name: state.name, max: formatBytes(state.error.maxBytes ?? rule.maxBytes, language) });
    case 'file_type':
    case 'file_type_refused':
      return fill(t.wrongType, { name: state.name, types });
    case 'docx_macros':
      return fill(t.macros, { name: state.name });
    case 'file_empty':
    case 'upload_file_missing':
      return fill(t.empty, { name: state.name });
    case 'too_many_uploads':
    case 'upload_quota_reached':
    case 'too_many_requests':
      return t.busy;
    default:
      return fill(t.failed, { name: state.name });
  }
}

export interface FileFieldProps {
  readonly id: string;
  readonly fieldKey: string;
  readonly label: string;
  readonly required: boolean;
  readonly rule: FileRule;
  readonly language: FormLanguage;
  readonly state: FileState | null;
  readonly onState: (state: FileState | null) => void;
  /** Uploads a file; rejects with a PublicApiError. */
  readonly upload: (file: File, onProgress: (percent: number) => void, signal: AbortSignal) => Promise<Uploaded>;
  /** The error of the field after Send (a required file that is missing). */
  readonly error?: string;
  /** Says an outcome in the form's polite live region (UX3-01): the upload began, the file is uploaded, or it was refused or stopped. */
  readonly announce?: (text: string) => void;
}

export function FileField({ id, fieldKey, label, required, rule, language, state, onState, upload, error, announce }: FileFieldProps) {
  const t = FORM_TEXTS[language].files;
  const running = useRef<AbortController | null>(null);
  // The latest state, for the callbacks of an upload that is still on its way.
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);
  useEffect(() => () => running.current?.abort(), []);

  const take = (files: File[]) => {
    const file = files[0];
    if (!file) return;
    running.current?.abort();
    const refused = checkFile(file, rule);
    if (refused) {
      const next = { name: file.name, size: file.size, error: refused };
      onState(next);
      announce?.(fileMessage(next, rule, language));
      return;
    }
    const controller = new AbortController();
    running.current = controller;
    onState({ name: file.name, size: file.size, progress: 0 });
    announce?.(fill(t.started, { name: file.name }));
    upload(
      file,
      (percent) => {
        if (running.current === controller) onState({ name: file.name, size: file.size, progress: percent });
      },
      controller.signal,
    ).then(
      (done) => {
        if (running.current !== controller) return;
        onState({ name: file.name, size: file.size, uploadId: done.id });
        announce?.(fill(t.uploaded, { name: file.name }));
      },
      (reason: unknown) => {
        if (running.current !== controller || controller.signal.aborted) return;
        const code = reason instanceof PublicApiError ? reason.code : 'network';
        const next = { name: file.name, size: file.size, error: { code } };
        onState(next);
        announce?.(fileMessage(next, rule, language));
      },
    );
  };

  const remove = () => {
    running.current?.abort();
    running.current = null;
    onState(null);
  };

  const shown = state ? [{ name: state.name, size: state.size, ...(state.progress !== undefined ? { progress: state.progress } : {}), ...(state.error ? { error: fileMessage(state, rule, language) } : {}) }] : [];
  const hint = fill(t.hint, { max: formatBytes(rule.maxBytes, language), types: typesText(rule) });
  return (
    <div id={id} tabIndex={-1} className="ud-span-all" data-confera-file={fieldKey} data-confera-file-state={state?.uploadId ? 'uploaded' : state?.error ? 'refused' : state ? 'uploading' : 'empty'}>
      <FileDropzone
        label={label}
        title={t.drop}
        required={required}
        hint={hint}
        accept={extensionsOf(rule).map((ext) => `.${ext}`).join(',')}
        files={shown}
        onFiles={take}
        onRemove={remove}
        status={error ? 'error' : 'default'}
        message={error}
      />
    </div>
  );
}
