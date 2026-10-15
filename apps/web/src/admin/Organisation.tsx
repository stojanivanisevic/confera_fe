'use client';

/**
 * The organisation profile (FR-ORG-03): the issuer data printed on documents, and the payment
 * details, which ask for the password again and tell every admin (ADR-03). A change of the
 * payment details is shown for 14 days. A change on an older version is refused (409).
 */
import { useEffect, useState, type FormEvent } from 'react';

import type { Organisation as Profile } from '@confera/api-client';
import { Alert, Button, Card, PageHeader, Textarea, TextButton, TextField, toast } from '@confera/ui';

import styles from './admin.module.css';
import { formatDate, withinDays } from './format';
import { isCancelled, useFreshPassword } from './FreshPassword';
import { call, explain, fieldMessages, type Explained } from './problems';
import { useSession } from './session';
import { fill, TEXTS } from './texts';
import { useLoad } from './useLoad';

type Issuer = Pick<Profile, 'name' | 'legalName' | 'address' | 'registrationNumber' | 'taxNumber' | 'contactEmail' | 'vatNoteSr' | 'vatNoteEn'>;
type Payment = Pick<Profile, 'rsdAccount' | 'eurIban' | 'eurSwift' | 'eurBankName' | 'paypalPayee'>;
const ISSUER_KEYS: (keyof Issuer)[] = ['name', 'legalName', 'address', 'registrationNumber', 'taxNumber', 'contactEmail', 'vatNoteSr', 'vatNoteEn'];
const PAYMENT_KEYS: (keyof Payment)[] = ['rsdAccount', 'eurIban', 'eurSwift', 'eurBankName', 'paypalPayee'];

const text = (value: string | null | undefined) => value ?? '';
const orNull = (value: string) => (value.trim() === '' ? null : value.trim());

export function Organisation() {
  const { client, contact, setContact } = useSession();
  const { withFreshPassword } = useFreshPassword();
  const t = TEXTS.organisation;
  const profile = useLoad<Profile>((c) => call(c.GET('/api/v1/organisation')), []);
  const record = profile.state.data;

  const [issuer, setIssuer] = useState<Record<keyof Issuer, string>>({ name: '', legalName: '', address: '', registrationNumber: '', taxNumber: '', contactEmail: '', vatNoteSr: '', vatNoteEn: '' });
  const [payment, setPayment] = useState<Record<keyof Payment, string>>({ rsdAccount: '', eurIban: '', eurSwift: '', eurBankName: '', paypalPayee: '' });
  const [issuerBusy, setIssuerBusy] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [issuerProblem, setIssuerProblem] = useState<Explained | null>(null);
  const [paymentProblem, setPaymentProblem] = useState<Explained | null>(null);
  const [issuerFields, setIssuerFields] = useState<Record<string, string>>({});
  const [paymentFields, setPaymentFields] = useState<Record<string, string>>({});
  const [loadedVersion, setLoadedVersion] = useState<number | null>(null);

  // What the API holds goes into the fields when it arrives, and again after a reload: state
  // derived from the loaded record, adjusted while rendering (React's pattern for it).
  if (record && record.version !== loadedVersion) {
    setLoadedVersion(record.version);
    setIssuer(Object.fromEntries(ISSUER_KEYS.map((key) => [key, text(record[key])])) as Record<keyof Issuer, string>);
    setPayment(Object.fromEntries(PAYMENT_KEYS.map((key) => [key, text(record[key])])) as Record<keyof Payment, string>);
  }
  const contactEmail = record?.contactEmail ?? null;
  useEffect(() => {
    if (record) setContact(contactEmail);
  }, [record, contactEmail, setContact]);

  const saveIssuer = async (event: FormEvent) => {
    event.preventDefault();
    if (!record) return;
    setIssuerBusy(true);
    setIssuerProblem(null);
    setIssuerFields({});
    try {
      const next = await call(
        client.PATCH('/api/v1/organisation', {
          body: {
            name: issuer.name.trim(),
            legalName: orNull(issuer.legalName),
            address: orNull(issuer.address),
            registrationNumber: orNull(issuer.registrationNumber),
            taxNumber: orNull(issuer.taxNumber),
            contactEmail: orNull(issuer.contactEmail),
            vatNoteSr: orNull(issuer.vatNoteSr),
            vatNoteEn: orNull(issuer.vatNoteEn),
            version: record.version,
          },
        }),
      );
      profile.replace(next);
      toast({ title: t.issuerSaved, tone: 'success' });
    } catch (error) {
      setIssuerFields(fieldMessages(error));
      setIssuerProblem(explain(error, contact));
    } finally {
      setIssuerBusy(false);
    }
  };

  const savePayment = async (event: FormEvent) => {
    event.preventDefault();
    if (!record) return;
    setPaymentBusy(true);
    setPaymentProblem(null);
    setPaymentFields({});
    try {
      const next = await withFreshPassword(() =>
        call(
          client.PUT('/api/v1/organisation/payment-details', {
            body: { rsdAccount: orNull(payment.rsdAccount), eurIban: orNull(payment.eurIban), eurSwift: orNull(payment.eurSwift), eurBankName: orNull(payment.eurBankName), paypalPayee: orNull(payment.paypalPayee), version: record.version },
          }),
        ),
      );
      profile.replace(next);
      toast({ title: t.paymentSaved, description: t.paymentSavedText, tone: 'success', duration: 8000 });
    } catch (error) {
      if (!isCancelled(error)) {
        setPaymentFields(fieldMessages(error));
        setPaymentProblem(explain(error, contact));
      }
    } finally {
      setPaymentBusy(false);
    }
  };

  const conflict = (problem: Explained | null) => problem?.code === 'version_conflict';
  const reloadAction = <TextButton onClick={() => void profile.reload()}>{t.reloadData}</TextButton>;

  if (profile.state.phase === 'failed' && !record) {
    return (
      <div className={styles.stack}>
        <PageHeader title={t.title} description={t.lead} />
        <Alert tone="error" title={profile.state.problem.title} action={<TextButton onClick={() => void profile.reload()}>{TEXTS.connection.tryAgain}</TextButton>}>
          {profile.state.problem.text}
        </Alert>
      </div>
    );
  }
  if (!record) return <PageHeader title={t.title} description={TEXTS.common.loading} />;

  const field = (key: keyof Issuer, label: string, extra: { hint?: string; type?: string } = {}) => (
    <TextField key={key} label={label} name={key} type={extra.type ?? 'text'} value={issuer[key]} onChange={(event) => setIssuer({ ...issuer, [key]: event.target.value })} status={issuerFields[key] ? 'error' : 'default'} message={issuerFields[key] ?? extra.hint} />
  );
  const payField = (key: keyof Payment, label: string) => (
    <TextField key={key} label={label} name={key} value={payment[key]} onChange={(event) => setPayment({ ...payment, [key]: event.target.value })} status={paymentFields[key] ? 'error' : 'default'} message={paymentFields[key]} />
  );
  const recent = withinDays(record.paymentDetailsChangedAt, 14);

  return (
    <div className={styles.stack}>
      <PageHeader title={t.title} description={t.lead} />
      {recent ? (
        <div data-confera-payment-notice>
          <Alert tone="warning" title={fill(t.recentChange, { when: formatDate(record.paymentDetailsChangedAt), who: record.paymentDetailsChangedBy?.displayName ?? TEXTS.audit.system })}>
            {t.recentChangeText}
          </Alert>
        </div>
      ) : null}
      <Card title={t.issuer} headingLevel={2}>
        <form className={styles.fields} onSubmit={(event) => void saveIssuer(event)} noValidate data-confera-issuer>
          {issuerProblem ? (
            <div className={styles.all}>
              <Alert tone="error" title={issuerProblem.title} action={conflict(issuerProblem) ? reloadAction : undefined}>
                {issuerProblem.text}
              </Alert>
            </div>
          ) : null}
          {field('name', t.name, { hint: t.nameHint })}
          {field('legalName', t.legalName)}
          <div className={styles.all}>
            <Textarea label={t.address} name="address" rows={3} value={issuer.address} onChange={(event) => setIssuer({ ...issuer, address: event.target.value })} status={issuerFields.address ? 'error' : 'default'} message={issuerFields.address} />
          </div>
          {field('registrationNumber', t.registrationNumber, { hint: t.registrationHint })}
          {field('taxNumber', t.taxNumber, { hint: t.taxHint })}
          {field('contactEmail', t.contactEmail, { hint: t.contactHint, type: 'email' })}
          <div className={styles.all}>
            <Textarea label={t.vatNoteSr} name="vatNoteSr" rows={2} value={issuer.vatNoteSr} onChange={(event) => setIssuer({ ...issuer, vatNoteSr: event.target.value })} status={issuerFields.vatNoteSr ? 'error' : 'default'} message={issuerFields.vatNoteSr ?? t.vatHint} />
          </div>
          <div className={styles.all}>
            <Textarea label={t.vatNoteEn} name="vatNoteEn" rows={2} value={issuer.vatNoteEn} onChange={(event) => setIssuer({ ...issuer, vatNoteEn: event.target.value })} status={issuerFields.vatNoteEn ? 'error' : 'default'} message={issuerFields.vatNoteEn} />
          </div>
          <div className={`${styles.all} ${styles.actions}`}>
            <Button type="submit" disabled={issuerBusy}>
              {issuerBusy ? TEXTS.setPassword.working : t.saveIssuer}
            </Button>
          </div>
        </form>
      </Card>
      <Card title={t.payment} subtitle={t.paymentLead} headingLevel={2}>
        <form className={styles.fields} onSubmit={(event) => void savePayment(event)} noValidate data-confera-payment>
          {paymentProblem ? (
            <div className={styles.all}>
              <Alert tone="error" title={paymentProblem.title} action={conflict(paymentProblem) ? reloadAction : undefined}>
                {paymentProblem.text}
              </Alert>
            </div>
          ) : null}
          {payField('rsdAccount', t.rsdAccount)}
          {payField('eurIban', t.eurIban)}
          {payField('eurSwift', t.eurSwift)}
          {payField('eurBankName', t.eurBankName)}
          {payField('paypalPayee', t.paypalPayee)}
          <div className={`${styles.all} ${styles.actions}`}>
            <Button type="submit" disabled={paymentBusy}>
              {paymentBusy ? TEXTS.setPassword.working : t.savePayment}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
