// Named tasks, run without a shell so they behave the same on every platform.
//   node scripts/run.mjs <task> [...arguments passed on to the tool]
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { refusedBrowserWindow } from './browser-windows.mjs';
import { fail, heading, root, runBin, runNode } from './lib.mjs';

const [task, ...extra] = process.argv.slice(2);

function tsProjects() {
  const projects = [join(root, 'tsconfig.json')];
  for (const group of ['apps', 'packages']) {
    for (const name of readdirSync(join(root, group))) {
      const file = join(root, group, name, 'tsconfig.json');
      if (existsSync(file)) projects.push(file);
    }
  }
  return projects;
}

/** The browser tests start only in a way that keeps every Chromium on the isolated profile (./browser-windows.mjs). */
function browserTests(args) {
  const refused = refusedBrowserWindow(extra, process.env);
  if (refused) fail(refused);
  return runBin('@playwright/test', 'playwright', ['test', ...args, ...extra]);
}

const tasks = {
  lint() {
    heading('eslint');
    let status = runBin('eslint', 'eslint', ['.', '--max-warnings', '0', ...extra]);
    if (status !== 0) return status;
    heading('style lint');
    status = runNode(join(root, 'scripts', 'lint-styles.mjs'));
    return status;
  },
  typecheck() {
    // Next writes its route types into next-env.d.ts and .next/types.
    heading('next typegen');
    let status = runNode(join(root, 'scripts', 'next.mjs'), ['typegen']);
    if (status !== 0) return status;
    for (const project of tsProjects()) {
      heading(`tsc ${project.slice(root.length + 1)}`);
      status = runBin('typescript', 'tsc', ['--noEmit', '-p', project]);
      if (status !== 0) return status;
    }
    return 0;
  },
  // No secret in the files of the repository (ADR-01). Same tool and preset as confera_be.
  secrets() {
    return runBin('secretlint', 'secretlint', ['**/*', '--secretlintignore', '.secretlintignore', ...extra]);
  },
  test() {
    return runBin('vitest', 'vitest', ['run', ...extra]);
  },
  e2e() {
    return browserTests([]);
  },
  'e2e-install'() {
    return runBin('@playwright/test', 'playwright', ['install', '--no-shell', 'chromium', 'firefox', 'webkit', ...extra]);
  },
  'ds-visual'() {
    return browserTests(['--config', 'playwright.ds-visual.config.ts']);
  },
};

if (!task || !(task in tasks)) fail(`Unknown task. One of: ${Object.keys(tasks).join(', ')}`);
process.exit(tasks[task]());
