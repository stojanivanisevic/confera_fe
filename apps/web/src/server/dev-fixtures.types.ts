/**
 * What only a test build has. Since 0.3.0 the forms come from the API (ADR-09; the browser tests
 * from the API stub, e2e/servers/public-forms.json): a build holds no form of its own.
 */
export interface DevFixtures {
  /** Routes that exist only in a test build, declared like the routes of routes.json. */
  readonly routes: readonly { readonly route: string; readonly kind: string; readonly surface: string }[];
}
