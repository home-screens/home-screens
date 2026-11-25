import { readConfig } from './config';
import { isAuthenticated } from './google-auth';
import { unansweredServices } from './service-outcomes';

/**
 * What is wrong with a set-up service, as Settings shows it.
 *
 * - `signIn`: Google Calendar has calendars picked and no sign-in that works.
 * - `unreachable`: the hub's last request to the service got no answer.
 *
 * Status and API keys used to judge a service by its saved keys alone, so a
 * dead Google sign-in or a switched-off Immich still read "Ready" and
 * "Connected" while the wall said otherwise.
 */
export type ServiceAttention = 'signIn' | 'unreachable';

/** Services that need attention now, by `CONNECTABLE_SERVICES` id. Empty when all is well. */
export async function servicesNeedingAttention(): Promise<Partial<Record<string, ServiceAttention>>> {
  const attention: Partial<Record<string, ServiceAttention>> = {};
  const config = await readConfig().catch(() => null);
  const googleCalendars = config?.settings.calendar?.googleCalendarIds ?? [];
  if (googleCalendars.length > 0 && !(await isAuthenticated().catch(() => false))) {
    attention.google = 'signIn';
  }
  for (const id of unansweredServices()) attention[id] = 'unreachable';
  return attention;
}
