'use client';

import { useSyncExternalStore } from 'react';

import { COMPONENT_NAMES, DS_VERSION } from '../generated/manifest';
import styles from './gallery.module.css';
import { SCENARIOS } from './scenarios';

const subscribeToNothing = () => () => undefined;

/**
 * The component gallery of the design system: every component of the bundle's
 * manifest, rendered through the adapter. It exists only in test builds
 * (the page that shows it is a `.dev.tsx` page).
 */
export function Gallery() {
  // False in the server markup, true once the browser has hydrated it, so a
  // test can tell a hydrated page from server markup.
  const hydrated = useSyncExternalStore(subscribeToNothing, () => true, () => false);

  return (
    <main className={styles.page} data-confera-dev="gallery" data-hydrated={hydrated ? 'true' : 'false'}>
      <h1 className={styles.title}>Design system gallery</h1>
      <p className={styles.lead}>
        UdEkoM Balkans design system {DS_VERSION}: {COMPONENT_NAMES.length} components, rendered on the server and hydrated.
      </p>
      {COMPONENT_NAMES.map((name) => {
        const Scenario = SCENARIOS[name];
        return (
          <section key={name} className={styles.card} data-confera-dev="gallery-card" data-component={name} aria-labelledby={`gallery-${name}`}>
            <h2 className={styles.name} id={`gallery-${name}`}>
              {name}
            </h2>
            <div className={styles.stage}>
              <Scenario />
            </div>
          </section>
        );
      })}
    </main>
  );
}
