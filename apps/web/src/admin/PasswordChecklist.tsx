'use client';

/**
 * The live password checklist (ADR-03, FR-USR-06, G2-25, ST-62): the four lines of the rule
 * set, each ticked as it is met while the person types. The lines are the API's own rule set,
 * run in the browser (@confera/api-client, password-rules): nothing is sent while the password
 * is typed. The server checks the same rules when the password is sent, and names a broken
 * rule by its code; the checklist shows it at the line.
 */
import { useId } from 'react';

import { checkPassword, type PasswordContext, type PasswordRuleId } from '@confera/api-client';
import { Icon } from '@confera/ui';

import styles from './checklist.module.css';
import { fill, TEXTS } from './texts';

export interface PasswordChecklistProps {
  readonly password: string;
  readonly repeat: string;
  readonly context: PasswordContext;
  /** The codes the server named when it refused the password (`password_length` and the like). */
  readonly refused?: readonly string[];
  /** The id the password fields describe themselves by. */
  readonly id?: string;
}

const CODE_OF: Readonly<Record<string, PasswordRuleId>> = { password_length: 'length', password_common: 'not_common', password_personal: 'not_personal', password_mismatch: 'match' };

export function lineText(id: PasswordRuleId, organisation: string | undefined): string {
  if (id === 'not_personal') return organisation ? fill(TEXTS.setPassword.lines.not_personal, { organisation }) : TEXTS.setPassword.lines.not_personal_plain;
  return TEXTS.setPassword.lines[id];
}

export function PasswordChecklist({ password, repeat, context, refused = [], id }: PasswordChecklistProps) {
  const autoId = useId();
  const listId = id ?? autoId;
  // Nothing is ticked before anything is typed: "not personal" holds for a password that exists, and
  // "both entries match" once the repeat is typed too (UXUI-M2-08).
  const lines = checkPassword(password, repeat, context).map((line) => ({ ...line, met: line.met && password !== '' && (line.id !== 'match' || repeat !== '') }));
  const refusedIds = new Set(refused.map((code) => CODE_OF[code]).filter((rule): rule is PasswordRuleId => rule !== undefined));
  return (
    <div className={styles.checklist} id={listId}>
      <p className={styles.title} id={`${listId}-title`}>
        {TEXTS.setPassword.checklistTitle}
      </p>
      <ul className={styles.list} aria-labelledby={`${listId}-title`} aria-live="polite" aria-atomic="false">
        {lines.map(({ id: rule, met }) => {
          // A rule the server named is red, even where the browser's own check holds it met (UXUI-M2-09).
          const failed = refusedIds.has(rule);
          return (
            <li key={rule} className={failed ? styles.refused : met ? styles.met : styles.open} data-rule={rule} data-met={met ? 'true' : 'false'} data-refused={failed ? 'true' : undefined}>
              <Icon name={failed ? 'alert-circle' : met ? 'check-circle-2' : 'circle'} size={16} />
              <span>{lineText(rule, context.organisationName)}</span>
              <span className="ud-sr">{met ? ` (${TEXTS.setPassword.met})` : ` (${TEXTS.setPassword.notMet})`}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
