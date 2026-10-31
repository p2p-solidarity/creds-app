/**
 * Where the owner edits each platform's bio and checks it saved (docs/ref/10
 * §2 step ②). Which links are verifiable at all is `socialTargetForLink` in
 * `@solidarity/shared` — the same rule creds.id's editor uses.
 */
import { ZKTLS_PLATFORMS, type SocialTarget } from '@solidarity/shared';

/** Where the owner pastes the marker; null when there is no edit page to open (websites). */
export function bioEditUrl(target: SocialTarget): string | null {
  switch (target.platform) {
    case 'x':
      return 'https://x.com/settings/profile';
    case 'github':
      return 'https://github.com/settings/profile';
    case 'telegram':
      return 'tg://settings';
    case 'website':
      return null;
  }
}

/** The public page the proof fetches — what the owner can open to check it saved. */
export function publicProfileUrl(target: SocialTarget): string {
  const rule = ZKTLS_PLATFORMS[target.platform];
  return `https://${rule.host(target.handle)}${rule.path(target.handle)}`;
}
