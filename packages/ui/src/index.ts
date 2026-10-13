// @confera/ui: the only way application code reaches the UdEkoM Balkans
// design system (ADR-21, NFR-UI-01).
//
//   import { Button, TextField } from '@confera/ui';
//   import '@confera/ui/styles';   // once, in the root layout
//
// The components are the design system's own, wrapped unchanged by
// `pnpm ds:build` so that they render on the server and hydrate.
export * from './generated/udekom.client';
export { COMPONENT_NAMES, DS_BUNDLE_SHA256, DS_VERSION } from './generated/manifest';
export type { ComponentName } from './generated/manifest';

export { SandboxedMarkupFrame } from './reviewed/SandboxedMarkupFrame';
export type { SandboxedMarkupFrameProps } from './reviewed/SandboxedMarkupFrame';
