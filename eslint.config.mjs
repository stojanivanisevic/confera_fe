// Lint rules of confera_fe (ADR-01, ADR-20, ADR-21, NFR-UI-01).
// The rules with a security or design-system purpose are named below and are
// proven by planted violations in lint-fixtures/ (tests/lint-fixtures.test.ts).
import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Application and package source, plus the planted violations (which are
// ignored in a normal run and linted only by their test).
const SOURCE = ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}', 'lint-fixtures/**/*.{ts,tsx}'];
// Everything except the design-system adapter itself.
const CONSUMERS = [
  'apps/*/src/**/*.{ts,tsx}',
  'packages/{form-renderer,embed-loader,api-client}/src/**/*.{ts,tsx}',
  'lint-fixtures/**/*.{ts,tsx}',
];

/** The one component that may render stored markup, inside a sandboxed frame (ADR-20). */
export const REVIEWED_RAW_MARKUP_COMPONENT = 'packages/ui/src/reviewed/SandboxedMarkupFrame.tsx';
/** The one module that may read the environment (ADR-01). */
export const CONFIG_MODULE = 'apps/web/src/config/**/*.ts';

// ---- NFR-UI-01: no second UI kit, no Tailwind, no other icon set -------------
const OTHER_UI_KITS = [
  '@mui/*', '@material-ui/*', '@emotion/*', 'antd', 'antd/*', '@ant-design/*', '@chakra-ui/*', '@radix-ui/*',
  'radix-ui', '@headlessui/*', '@mantine/*', '@nextui-org/*', '@heroui/*', '@fluentui/*', '@blueprintjs/*',
  '@base-ui-components/*', '@ark-ui/*', '@carbon/*', '@adobe/react-spectrum', '@react-aria/*',
  'react-aria-components', 'react-bootstrap', 'reactstrap', 'bootstrap', 'bootstrap/*', 'semantic-ui-react',
  'primereact', 'primereact/*', 'rsuite', 'grommet', 'evergreen-ui', 'flowbite', 'flowbite-react', 'daisyui',
  'shadcn', 'shadcn-ui', '@shadcn/*', 'tailwindcss', 'tailwindcss/*', '@tailwindcss/*', 'tailwind-merge',
  'class-variance-authority', 'styled-components', 'lucide-react', 'react-icons', 'react-icons/*',
  '@heroicons/*', '@tabler/*', '@fortawesome/*',
];
const UI_KIT_MESSAGE =
  'The UI comes only from the UdEkoM Balkans design system, through @confera/ui (NFR-UI-01, ADR-21). No second UI kit, icon set or Tailwind.';
const DS_INTERNALS = ['**/design-system/**', '@confera/ui/src/**', '**/packages/ui/src/**'];
const DS_INTERNALS_MESSAGE =
  'Application code imports only the public entry of @confera/ui, never the design-system folder or the adapter internals (ADR-21).';

// ---- Selector groups for no-restricted-syntax --------------------------------
const HEX = String.raw`/(^|[^\w&])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![\w-])/`;
const COLOUR_FUNCTION = String.raw`/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix)\(/i`;
const COLOUR_MESSAGE =
  'No colour literals: colours come from the design-system tokens, as var(--token) (NFR-UI-01).';
const COLOUR_PROPERTIES =
  '/^(color|background|backgroundColor|borderColor|borderTopColor|borderRightColor|borderBottomColor|borderLeftColor|outlineColor|fill|stroke|caretColor|accentColor)$/';

const colourLiterals = [
  { selector: `Literal[value=${HEX}]`, message: COLOUR_MESSAGE },
  { selector: `TemplateElement[value.raw=${HEX}]`, message: COLOUR_MESSAGE },
  { selector: `Literal[value=${COLOUR_FUNCTION}]`, message: COLOUR_MESSAGE },
  { selector: `TemplateElement[value.raw=${COLOUR_FUNCTION}]`, message: COLOUR_MESSAGE },
  {
    selector: `Property[key.name=${COLOUR_PROPERTIES}] > Literal[value=/^(?!var\\(--|inherit$|currentColor$|transparent$|none$|initial$|unset$)/]`,
    message: COLOUR_MESSAGE,
  },
];

const RAW_MARKUP_MESSAGE =
  'Raw markup is rendered only by the one reviewed component, SandboxedMarkupFrame in @confera/ui (ADR-20, SEC-A-19).';
const rawMarkup = [
  { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: RAW_MARKUP_MESSAGE },
  { selector: "Property[key.name='dangerouslySetInnerHTML']", message: RAW_MARKUP_MESSAGE },
  { selector: "Property[key.value='dangerouslySetInnerHTML']", message: RAW_MARKUP_MESSAGE },
  { selector: 'JSXAttribute[name.name=/^srcdoc$/i]', message: RAW_MARKUP_MESSAGE },
  { selector: 'Property[key.name=/^srcdoc$/i]', message: RAW_MARKUP_MESSAGE },
  {
    selector: "AssignmentExpression[left.type='MemberExpression'][left.property.name=/^(innerHTML|outerHTML|srcdoc)$/]",
    message: RAW_MARKUP_MESSAGE,
  },
  {
    selector: 'CallExpression[callee.property.name=/^(insertAdjacentHTML|createContextualFragment|setHTMLUnsafe|parseHTMLUnsafe)$/]',
    message: RAW_MARKUP_MESSAGE,
  },
  {
    selector: "CallExpression[callee.object.name='document'][callee.property.name=/^(write|writeln)$/]",
    message: RAW_MARKUP_MESSAGE,
  },
];

const codeFromText = [
  { selector: "CallExpression[callee.name='eval']", message: 'No eval.' },
  { selector: "NewExpression[callee.name='Function']", message: 'No code from text.' },
  { selector: "CallExpression[callee.name='Function']", message: 'No code from text.' },
];

const processEnv = [
  {
    selector: "MemberExpression[object.name='process'][property.name='env']",
    message: 'Only the configuration module (apps/web/src/config) reads the environment (ADR-01).',
  },
];

const serverActions = [
  {
    selector: "ExpressionStatement[directive='use server']",
    message: 'No server actions: the web application only renders and forwards (ADR-20, SEC-A-02).',
  },
];

const restricted = (...groups) => ['error', ...groups.flat()];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.next-test/**',
      '.artifacts/**',
      'playwright-report/**',
      'test-results/**',
      '**/next-env.d.ts',
      // The design system is its own release and its bundle is plain ES5; `pnpm ds:check` guards it.
      'design-system/**',
      // Generated files.
      'packages/ui/src/generated/**',
      'packages/api-client/src/generated/**',
      // Planted violations: linted only by tests/lint-fixtures.test.ts.
      ...(process.env.CONFERA_LINT_FIXTURES === '1' ? [] : ['lint-fixtures/**']),
    ],
  },

  // ---- React (the framework's own lint preset is not used: see README, "Lint") ----
  {
    files: ['**/*.{ts,tsx}'],
    extends: [react.configs.flat.recommended, react.configs.flat['jsx-runtime'], reactHooks.configs.flat.recommended],
    settings: { react: { version: '19.3' } },
    rules: { 'react/prop-types': 'off' },
  },

  // ---- TypeScript: type-checked lint (ADR-01) ---------------------------------
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },

  // ---- Accessibility of our own markup ----------------------------------------
  {
    files: ['**/*.tsx'],
    extends: [jsxA11y.flatConfigs.recommended],
  },

  // ---- Rules with a security or design-system purpose -------------------------
  {
    files: SOURCE,
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: OTHER_UI_KITS, message: UI_KIT_MESSAGE }] }],
      'react/no-danger': 'error',
      'no-restricted-syntax': restricted(colourLiterals, rawMarkup, codeFromText, processEnv, serverActions),
    },
  },
  {
    files: CONSUMERS,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: OTHER_UI_KITS, message: UI_KIT_MESSAGE },
            { group: DS_INTERNALS, message: DS_INTERNALS_MESSAGE },
          ],
        },
      ],
    },
  },
  {
    // The one module that reads the environment.
    files: [CONFIG_MODULE],
    rules: { 'no-restricted-syntax': restricted(colourLiterals, rawMarkup, codeFromText, serverActions) },
  },
  {
    // The one reviewed component that renders stored markup.
    files: [REVIEWED_RAW_MARKUP_COMPONENT],
    rules: {
      'react/no-danger': 'off',
      'no-restricted-syntax': restricted(colourLiterals, codeFromText, processEnv, serverActions),
    },
  },

  // ---- Tooling: scripts, configuration and tests ------------------------------
  {
    files: ['scripts/**/*.mjs', 'e2e/**/*.mjs', '*.config.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { globals: { ...globals.node }, sourceType: 'module' },
    rules: { 'no-console': 'off' },
  },
  {
    files: ['e2e/**/*.ts', 'tests/**/*.{ts,tsx}', '*.config.ts', '**/*.test.{ts,tsx}'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  {
    files: ['e2e/harness/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
