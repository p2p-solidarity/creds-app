import { visibilityAt, type LinkVisibility } from '@/profile/projection';
import type { ProfileLink } from '@solidarity/shared';

/**
 * Present is one card (10 §4): the QR is the Page — online `creds.id/@name`
 * or the offline fragment URL — and the list under it is exactly the public
 * links that Page shows. No card-only fields: nothing travels in a QR that
 * the Page itself does not carry.
 */
export interface PresentPublicLink {
  readonly link: ProfileLink;
  readonly sourceIndex: number;
}

export function presentPublicLinks(
  links: readonly ProfileLink[],
  linkVisibility: readonly LinkVisibility[],
): readonly PresentPublicLink[] {
  return links.flatMap((link, sourceIndex) =>
    visibilityAt(linkVisibility, sourceIndex) === 'public' ? [{ link, sourceIndex }] : [],
  );
}

export type PhysicalCardMaterial = 'steel' | 'blackTitanium' | 'brass';

/**
 * Present-only preferences, as an optional augmentation so old `prefs:v1`
 * payloads stay valid while every write goes through `usePreferences.set`.
 */
declare module '@/settings/preferences' {
  interface Preferences {
    readonly presentPhysicalCardMaterial?: PhysicalCardMaterial;
    readonly presentPhysicalCardEngraveName?: boolean;
    readonly presentPhysicalCardEngraveUsername?: boolean;
    readonly presentPhysicalCardEngraveQr?: boolean;
  }
}
