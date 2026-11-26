import { notFound } from 'next/navigation';
import { googlePickerTokenStore } from '@/lib/google-token-stores';
import GoogleSignInReturn from './GoogleSignInReturn';

// The switch is read per request, never frozen at build time.
export const dynamic = 'force-dynamic';

/**
 * Where homescreens.dev/connect/google sends a Google Photos or Google
 * Calendar (adding events) sign-in back to the hub. Only sign-in links made
 * with Home Screens' own Google app switched on (HS_GOOGLE_HOSTED) ever lead
 * here, so with it off the page doesn't exist.
 */
export default function ConnectGooglePage() {
  if (!googlePickerTokenStore.hostedAvailable()) notFound();
  return <GoogleSignInReturn />;
}
