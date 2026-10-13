// Entry of the small script build of React that the design-system previews
// need (they expect the globals React and ReactDOM). Used only by `pnpm ds:visual`.
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { createRoot, hydrateRoot } from 'react-dom/client';

globalThis.React = React;
globalThis.ReactDOM = { ...ReactDOM, createRoot, hydrateRoot };
