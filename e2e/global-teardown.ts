// Runs once after the browser tests: the last look at the Windows account's
// bad-password count (e2e/support/os-isolation.ts).
import { assertWindowsAccountUntouched } from './support/os-isolation';

export default function globalTeardown(): void {
  assertWindowsAccountUntouched('at the end of the run');
}
