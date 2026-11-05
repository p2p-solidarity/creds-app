import type { ContactManifestEntry } from '@/contacts/repository';
import type { useTranslation } from '@/i18n';

type Translate = ReturnType<typeof useTranslation>['t'];

/** Source copy is rendered only from persisted manifest fields (never mock context). */
export function contactSourceDescription(
  contact: Pick<ContactManifestEntry, 'source' | 'tags'>,
  t: Translate,
): string | undefined {
  if (contact.source === 'Manual') return t('peopleList.sourceManual');
  const source = contactSourceTag(contact, t);
  return source ? t('peopleList.sourceCard', { source }) : undefined;
}

export function contactSourceTag(
  contact: Pick<ContactManifestEntry, 'source' | 'tags'>,
  t: Translate,
): string | undefined {
  if (contact.source === 'Manual') return t('peopleList.sourceManual');
  return contact.tags
    .map((tag) => tag.trim())
    .find((tag) => tag.length > 0) ?? sourceName(contact.source, t);
}

export function sourceName(
  source: ContactManifestEntry['source'],
  t: Translate,
): string | undefined {
  switch (source) {
    case 'QR Code':
      return t('peopleList.sourceQr');
    case 'Proximity':
      return t('peopleList.sourceProximity');
    case 'App Clip':
      return t('peopleList.sourceAppClip');
    case 'AirDrop':
      return t('peopleList.sourceAirDrop');
    case 'Manual':
      return t('peopleList.sourceManual');
  }
}
