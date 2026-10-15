import type { ReactNode } from 'react';

import styles from './admin.module.css';
import { TEXTS } from './texts';

/** One column with the product's name above: the frame of every page outside the shell. */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className={styles.auth}>
      <div className={styles.authHead}>
        <img src="/icon.png" alt="" width={28} height={28} />
        <span className={styles.brand}>{TEXTS.product}</span>
      </div>
      {children}
    </main>
  );
}
