// What the scan for secret-like names (scripts/secret-assignments/) leaves out in THIS
// repository. The scanner itself knows nothing about the repository it runs in; lockfiles
// it leaves out everywhere.
//
// Only generated or vendored files belong here, and the README lists the same ones
// (section 11, "Secret scan"). A hand-written file with a finding is changed to follow
// the rule, never added to this list. The design system (design-system/) is written in
// this repository and is read.
export const SECRET_SCAN_EXCLUDE = [
  // The API contract of confera_be: two OpenAPI documents and their lock, vendored by `pnpm api:sync`.
  'packages/api-client/openapi/',
  // The TypeScript types generated from those documents, by the same command.
  'packages/api-client/src/generated/',
  // The design-system script wrapped, unchanged, in a client module by `pnpm ds:build`.
  // Its source, design-system/components/bundle.js, is read.
  'packages/ui/src/generated/',
];
