/**
 * Share my phone / email / note with one saved person over NIP-17 (docs/ref/16
 * P2, §4). Fixed order: check the fields → Face ID (red line `sendPrivate`) →
 * seal and send. Nothing is sent before Face ID passes.
 */
import { buildContactShareRumor, err, ok, type ProfileRecord, type Result } from '@solidarity/shared';

import { translate } from '@/i18n';
import { requireSensitiveAction } from '@/keychain/biometricGatekeeper';
import { captureLocalDataEpoch } from '@/settings/localDataWipeBarrier';

import { myEmbeddablePage, recipientHexOf, sendRumor, type PrivateSendFailure } from './send';
import { usePrivateExchangeStore, type ContactShareDraft } from './store';

/** Same limits the receiver's parser enforces (`contact.share` schema). */
const LIMITS = { phone: 32, email: 254, note: 500 } as const;

export type ContactShareFailure = PrivateSendFailure | 'nothingToShare' | 'tooLong' | 'faceIdDenied';

export async function shareContactDetails(
  record: ProfileRecord,
  draft: ContactShareDraft
): Promise<Result<number, ContactShareFailure>> {
  const fields = {
    phone: draft.phone.trim(),
    email: draft.email.trim(),
    note: draft.note.trim(),
  };
  if (fields.phone === '' && fields.email === '' && fields.note === '') return err('nothingToShare');
  if ((Object.keys(LIMITS) as (keyof typeof LIMITS)[]).some((k) => fields[k].length > LIMITS[k])) {
    return err('tooLong');
  }
  const recipientHex = recipientHexOf(record);
  if (recipientHex === null) return err('recipientNoNostr');
  const page = myEmbeddablePage();
  if (!page.ok) return page;

  const gate = await requireSensitiveAction('sendPrivate', translate('security.prompt.sendPrivate'));
  if (!gate.success) return err('faceIdDenied');

  const epoch = captureLocalDataEpoch();
  const sent = await sendRumor(
    buildContactShareRumor({
      recipientHex,
      ...(page.value === undefined ? {} : { page: page.value }),
      ...(fields.phone === '' ? {} : { phone: fields.phone }),
      ...(fields.email === '' ? {} : { email: fields.email }),
      ...(fields.note === '' ? {} : { note: fields.note }),
    }),
    recipientHex
  );
  if (!sent.ok) return sent;
  const at = Math.floor(Date.now() / 1000);
  usePrivateExchangeStore.getState().recordContactSent(record.did, fields, at, epoch);
  return ok(at);
}
