import { Redirect } from 'expo-router';

import { PasskeysScreen } from '@/components/passkeys/PasskeysScreen';
import { capabilities } from '@/platform/distribution';

/** No passkeys in this build (F-Droid): the recovery phrase is the backup. */
export default function PasskeysRoute() {
  if (!capabilities.passkeys) return <Redirect href="/settings" />;
  return <PasskeysScreen />;
}
