// Style lint of confera_fe (NFR-UI-01, ADR-21, ADR-28).
//
// A small PostCSS-based linter with exactly the rules this project needs:
//   colour-literal   no hex colour, named colour or colour function: colours are tokens
//   unknown-custom-property   every var(--x) is a design-system token or defined in the same file
//   external-url     no address of another origin in a stylesheet (fonts, images)
//   no-import        no @import: stylesheets are imported from code, never from elsewhere
//   no-tailwind      no Tailwind at-rules
//   ds-override      outside design-system/: no restyling of ud-* classes and no redefined
//                    token, so no override layer can grow next to the design system (ADR-22)
//   size-literal     no px length above 2px in a font, line height, padding, margin, gap,
//                    inset or width/height (and their min/max): sizes are tokens (M1-ISS-19).
//                    1 and 2 px stay px: borders, outlines and the hairline math around them
//   font-literal     no font family other than var(--font-*), in font-family or in the font
//                    shorthand: type comes from the tokens (M1-ISS-19)
// Not checked, on purpose: border, outline and shadow widths, transforms, grid track
// minimums and flex bases (layout, not the size of a part), and the breakpoints in @media,
// where a custom property cannot be used (tokens.json lists them).
//
// Why not Stylelint: see README, "Lint". The planted violations in
// lint-fixtures/ prove each rule (tests/lint-fixtures.test.ts).
//
//   node scripts/lint-styles.mjs [files or directories ...]
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import postcss from 'postcss';
import valueParser from 'postcss-value-parser';

import { root } from './lib.mjs';

const COLOUR_FUNCTIONS = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color', 'color-mix', 'device-cmyk']);
const TAILWIND_AT_RULES = new Set(['tailwind', 'apply', 'theme', 'utility', 'variant', 'custom-variant', 'plugin', 'config', 'source', 'reference', 'screen']);
// Properties whose value is a name, not a colour.
const NAME_PROPERTIES = /^(font|font-family|animation|animation-name|grid-area|grid-template-areas|grid-row|grid-column|counter-reset|counter-increment|content|will-change|transition|transition-property|view-transition-name|container|container-name)$/;
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

// The CSS named colours (CSS Color 4) and the system colours. `transparent`
// and `currentcolor` are keywords, not literals, and stay allowed.
const NAMED_COLOURS = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue
  chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey
  darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray
  darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen
  fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki
  lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen
  lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime
  limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue
  mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive
  olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
  powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver
  skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white
  whitesmoke yellow yellowgreen
  accentcolor accentcolortext activetext buttonborder buttonface buttontext canvas canvastext field fieldtext graytext
  highlight highlighttext linktext mark marktext selecteditem selecteditemtext visitedtext`
    .split(/\s+/)
    .filter(Boolean),
);

const MESSAGES = {
  'colour-literal': 'No colour literal: use a design-system token, var(--token) (NFR-UI-01).',
  'unknown-custom-property': 'This custom property is not a design-system token and is not defined in this file (ADR-21).',
  'external-url': 'No address of another origin in a stylesheet (ADR-21, ADR-28).',
  'no-import': 'No @import: stylesheets are imported from code, never from another origin (ADR-21).',
  'no-tailwind': 'No Tailwind: styling is CSS Modules on design-system tokens (NFR-UI-01).',
  'ds-override':
    'No override layer: application styles do not restyle ud-* classes or redefine a token. Change the design system in a release instead (ADR-21, ADR-22).',
  'size-literal':
    'No size literal: use a spacing, size or type token, var(--gutter-*), var(--…) or font: var(--text-*). Only 1 and 2 px stay px (M1-ISS-19).',
  'font-literal': 'No font family literal: use var(--font-sans), var(--font-ui) or font: var(--text-*) (M1-ISS-19).',
};

// Properties whose lengths are sizes (M1-ISS-19). Borders, outlines, shadows, transforms, grid
// templates and flex bases are not among them.
const SIZE_PROPERTIES =
  /^(font|font-size|line-height|letter-spacing|word-spacing|text-indent|padding(-.+)?|margin(-.+)?|scroll-margin(-.+)?|scroll-padding(-.+)?|gap|row-gap|column-gap|inset(-.+)?|top|right|bottom|left|(min-|max-)?(width|height|block-size|inline-size))$/;
/** The largest px length that stays a literal: borders, outlines and the hairline math around them. */
const HAIRLINE_PX = 2;
const CSS_WIDE = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer']);
// Words of the font shorthand that are not a family: styles, variants, weights, stretches, sizes, system fonts.
const FONT_KEYWORDS = new Set(
  `normal italic oblique small-caps bold bolder lighter ultra-condensed extra-condensed condensed semi-condensed semi-expanded
  expanded extra-expanded ultra-expanded xx-small x-small small medium large x-large xx-large xxx-large larger smaller
  caption icon menu message-box small-caption status-bar`.split(/\s+/),
);

/** The px lengths in a value that are not hairlines, e.g. ["12px"]. */
function sizeLiterals(value) {
  const found = [];
  valueParser(value).walk((part) => {
    if (part.type === 'function' && part.value.toLowerCase() === 'url') return false;
    if (part.type !== 'word') return undefined;
    const unit = valueParser.unit(part.value);
    if (unit && unit.unit.toLowerCase() === 'px' && Math.abs(Number(unit.number)) > HAIRLINE_PX) found.push(part.value);
    return undefined;
  });
  return found;
}

/** A family that is not a font token: a quoted name, or a word that is not a keyword or a length. */
function fontFamilyLiterals(value, shorthand) {
  const parsed = valueParser(value);
  const top = parsed.nodes.filter((n) => n.type !== 'space' && n.type !== 'comment');
  if (top.length === 1 && top[0].type === 'word' && CSS_WIDE.has(top[0].value.toLowerCase())) return [];
  const found = [];
  for (const part of top) {
    if (part.type === 'function') {
      const name = part.value.toLowerCase();
      if (name === 'var') {
        const ref = part.nodes[0]?.value ?? '';
        // font-family takes a family token; the shorthand also takes a type style.
        if (!/^--font-/.test(ref) && !(shorthand && /^--text-/.test(ref))) found.push(`var(${ref})`);
      }
      continue;
    }
    if (part.type === 'string') found.push(`"${part.value}"`);
    else if (part.type === 'word') {
      const word = part.value.toLowerCase();
      if (shorthand && (FONT_KEYWORDS.has(word) || valueParser.unit(part.value) || /^\d/.test(word))) continue;
      found.push(part.value);
    }
  }
  return found;
}

/** The names of the custom properties that tokens.css defines. */
export function readTokenNames(tokensCssPath = join(root, 'design-system', 'tokens.css')) {
  if (!existsSync(tokensCssPath)) return new Set();
  const names = new Set();
  postcss.parse(readFileSync(tokensCssPath, 'utf8')).walkDecls(/^--/, (decl) => names.add(decl.prop));
  return names;
}

/**
 * Lints one stylesheet.
 * @param {string} css
 * @param {{ filename?: string, tokens?: Set<string>, designSystem?: boolean }} [options]
 * @returns {Array<{ rule: string, message: string, line: number, column: number, text: string }>}
 */
export function lintCss(css, options = {}) {
  const findings = [];
  const tokens = options.tokens ?? new Set();
  const cssRoot = postcss.parse(css, { from: options.filename });
  const report = (rule, node, text) =>
    findings.push({ rule, message: MESSAGES[rule], line: node.source?.start?.line ?? 0, column: node.source?.start?.column ?? 0, text });

  const local = new Set();
  cssRoot.walkDecls(/^--/, (decl) => local.add(decl.prop));

  const checkValue = (value, node, property = '') => {
    const named = !NAME_PROPERTIES.test(property) && !property.startsWith('--');
    valueParser(value).walk((part) => {
      if (part.type === 'function') {
        const name = part.value.toLowerCase();
        if (COLOUR_FUNCTIONS.has(name)) report('colour-literal', node, `${part.value}(…)`);
        if (name === 'url') {
          const target = part.nodes.map((n) => n.value).join('').trim();
          if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(target) || /^(?:https?|ftp|wss?):/i.test(target)) report('external-url', node, target);
          return false; // a fragment such as url(#mask) is not a colour
        }
        if (name === 'var') {
          const ref = part.nodes[0]?.value;
          if (ref && ref.startsWith('--') && !tokens.has(ref) && !local.has(ref)) report('unknown-custom-property', node, ref);
        }
      } else if (part.type === 'word') {
        if (HEX.test(part.value)) report('colour-literal', node, part.value);
        else if (named && NAMED_COLOURS.has(part.value.toLowerCase())) report('colour-literal', node, part.value);
      }
      return undefined;
    });
  };

  cssRoot.walk((node) => {
    if (node.type === 'rule' && !options.designSystem && /\.ud-[a-z]/.test(node.selector)) {
      report('ds-override', node, node.selector);
    }
    if (node.type === 'decl') {
      const prop = node.prop.toLowerCase();
      if (!options.designSystem && node.prop.startsWith('--') && tokens.has(node.prop)) report('ds-override', node, node.prop);
      checkValue(node.value, node, prop);
      // A custom property of one's own is checked too, or it would be the way around the rule.
      if (SIZE_PROPERTIES.test(prop) || prop.startsWith('--')) for (const literal of sizeLiterals(node.value)) report('size-literal', node, `${node.prop}: ${literal}`);
      // In @font-face, font-family is the name being declared, not a use of one.
      const declaresAFace = node.parent?.type === 'atrule' && node.parent.name.toLowerCase() === 'font-face';
      if ((prop === 'font-family' || prop === 'font') && !declaresAFace) {
        for (const literal of fontFamilyLiterals(node.value, prop === 'font')) report('font-literal', node, `${node.prop}: ${literal}`);
      }
    } else if (node.type === 'atrule') {
      const name = node.name.toLowerCase();
      if (name === 'import') {
        report('no-import', node, node.params);
        if (/(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(node.params)) report('external-url', node, node.params);
      } else if (TAILWIND_AT_RULES.has(name)) {
        report('no-tailwind', node, `@${node.name}`);
      }
    }
  });

  return findings;
}

function* cssFiles(path) {
  const stat = statSync(path);
  if (stat.isFile()) {
    if (path.endsWith('.css')) yield path;
    return;
  }
  for (const name of readdirSync(path)) {
    if (name === 'node_modules' || name.startsWith('.next') || name === '.artifacts') continue;
    yield* cssFiles(join(path, name));
  }
}

/** Lints files and directories. Returns the findings with their file. */
export function lintPaths(paths, options = {}) {
  const tokens = options.tokens ?? readTokenNames();
  const all = [];
  let count = 0;
  for (const path of paths) {
    if (!existsSync(path)) continue;
    for (const file of cssFiles(path)) {
      count += 1;
      const designSystem = file.startsWith(join(root, 'design-system'));
      for (const finding of lintCss(readFileSync(file, 'utf8'), { filename: file, tokens, designSystem })) all.push({ file, ...finding });
    }
  }
  return { findings: all, files: count };
}

/** What `pnpm lint` checks: application and package styles, and the design-system stylesheets except the tokens. */
export const DEFAULT_PATHS = ['apps', 'packages', 'design-system/components/bundle.css', 'design-system/fonts/fonts.css'];

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const paths = (args.length > 0 ? args : DEFAULT_PATHS).map((p) => resolve(root, p));
  const { findings, files } = lintPaths(paths);
  for (const f of findings) {
    console.error(`${relative(root, f.file)}:${f.line}:${f.column}  ${f.rule}  ${f.message}  [${f.text}]`);
  }
  if (findings.length > 0) {
    console.error(`\n✗ ${findings.length} style problem(s) in ${files} stylesheet(s)`);
    process.exit(1);
  }
  console.log(`✓ ${files} stylesheet(s): no colour, size or font literal, unknown token, external address, @import, Tailwind or design-system override`);
}
