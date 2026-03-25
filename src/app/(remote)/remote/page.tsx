import { readConfig } from '@/lib/config';
import RemoteClient from './RemoteClient';

export const dynamic = 'force-dynamic';

export default async function RemotePage() {
  const config = await readConfig();

  const screens = config.screens.map((s) => ({ id: s.id, name: s.name }));
  const profiles = (config.profiles ?? []).map((p) => ({ id: p.id, name: p.name }));
  const activeProfile = config.settings.activeProfile;

  return (
    <RemoteClient
      initialData={{ screens, profiles, activeProfile }}
    />
  );
}
