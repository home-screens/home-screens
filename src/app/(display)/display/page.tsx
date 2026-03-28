import { readConfig } from '@/lib/config';
import { getDisplayToken } from '@/lib/auth';
import ScreenRotator from '@/components/display/ScreenRotator';

export const dynamic = 'force-dynamic';

export default async function DisplayPage() {
  const [config, displayToken] = await Promise.all([readConfig(), getDisplayToken()]);

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#000' }}>
      <ScreenRotator screens={config.screens} settings={config.settings} profiles={config.profiles} displayToken={displayToken} />
    </div>
  );
}
