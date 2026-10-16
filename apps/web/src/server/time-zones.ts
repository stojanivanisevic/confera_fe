/**
 * The time zones a conference may have (E2-10): the IANA names of the server's runtime, the same
 * source confera_be checks a time zone against (`Intl.supportedValuesOf('timeZone')` of Node), and
 * UTC. Read on the server and handed to the form, never from the browser, whose ICU version may
 * know zones the API does not ("America/Coyhaique" in Chromium today).
 */
export function apiTimeZones(): string[] {
  return ['UTC', ...Intl.supportedValuesOf('timeZone').filter((zone) => zone !== 'UTC')];
}
