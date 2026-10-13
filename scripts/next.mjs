// The only way this repository starts Next.js (ADR-20).
//   node scripts/next.mjs dev|build|start [--dev-pages] [...next arguments]
// It turns the framework's telemetry off, loads .env, and chooses between
// the production build and the test build (gallery and spike fixtures).
import { fail, loadRootEnv, resolveBin, runNode, webDir } from './lib.mjs';

const [command, ...rest] = process.argv.slice(2);
if (!['dev', 'build', 'start', 'typegen', 'telemetry', 'info'].includes(command)) {
  fail('Usage: node scripts/next.mjs dev|build|start [--dev-pages] [...next arguments]');
}

loadRootEnv();

const args = rest.filter((a) => a !== '--dev-pages');
// `next dev` is a development tool and always carries the dev pages.
const devPages = command === 'dev' || rest.includes('--dev-pages');

if (devPages && process.env.STAGE === 'prod') {
  fail('The dev pages (gallery, spike fixtures) cannot be built or started with STAGE=prod (ADR-24).');
}

const env = {
  // ADR-20: telemetry off. The variable is the framework's documented switch.
  NEXT_TELEMETRY_DISABLED: '1',
  CONFERA_DEV_PAGES: devPages ? '1' : '0',
};

if (['dev', 'start'].includes(command) && !args.includes('-p') && !args.includes('--port')) {
  args.push('-p', process.env.PORT || '3000');
}

const next = resolveBin('next', 'next', webDir);
process.exit(runNode(next, [command, ...args], { cwd: webDir, env }));
