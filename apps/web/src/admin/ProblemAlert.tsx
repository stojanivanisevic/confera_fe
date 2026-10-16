'use client';

/**
 * The alert of a refusal (UXUI-M2-21): the design system's error Alert, which takes the focus when
 * it appears, so that a keyboard user goes on from it and a screen reader reads it where the person
 * is, instead of the focus falling to the page.
 */
import { useEffect, useRef, type ComponentProps } from 'react';

import { Alert } from '@confera/ui';

import styles from './admin.module.css';

type ProblemAlertProps = Omit<ComponentProps<typeof Alert>, 'tone'>;

export function ProblemAlert(props: ProblemAlertProps) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
  }, [props.title]);
  return (
    <div ref={box} tabIndex={-1} className={styles.problem}>
      <Alert tone="error" {...props} />
    </div>
  );
}
