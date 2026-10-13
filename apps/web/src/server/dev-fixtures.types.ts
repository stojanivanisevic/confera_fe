/** A form as the 0.1.0 spike knows it. From 0.3.0 the form comes from the API (ADR-09). */
export interface DevFixtureForm {
  /** The sites that may frame this form (FR-FORM-07): origins, already reduced to scheme, host and port. */
  readonly sites: readonly string[];
}

export interface DevFixtures {
  readonly forms: Readonly<Record<string, DevFixtureForm>>;
}
