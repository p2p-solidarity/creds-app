/**
 * Why a Page draft can't be signed, in the owner's terms. `saveProfile`
 * rejects a draft by schema path (`page.blocks.2.items.1.url`); the Page tab
 * runs the same schema on the draft up front so the publish card names the
 * section and item to fix — and disables Publish — before a Face ID prompt
 * that could only fail.
 */
import { profileLinkSchema, publicPageDesignSchema, type ProfileLink, type PublicPageDesign } from '@solidarity/shared';

import type { useTranslation } from '@/i18n';
import { linkDisplay } from '@/profile/linkPresentation';

type TFn = ReturnType<typeof useTranslation>['t'];

const quote = (text: string, fallback: string): string => {
  const trimmed = text.trim();
  return trimmed.length > 24 ? `${trimmed.slice(0, 23)}…` : trimmed.length > 0 ? trimmed : fallback;
};

export function pagePublishProblem(page: PublicPageDesign, links: readonly ProfileLink[], t: TFn): string | null {
  for (const link of links) {
    if (!profileLinkSchema.safeParse(link).success) {
      return t('meEdit.invalidLink', { link: linkDisplay(link.label, link.url).text });
    }
  }
  const parsed = publicPageDesignSchema.safeParse(page);
  if (parsed.success) return null;
  const path = parsed.error.issues[0]?.path ?? [];
  if (path[0] === 'appearance') return t('pageDesign.problem.footer');
  const blockIndex = typeof path[1] === 'number' ? path[1] : null;
  const block = blockIndex === null ? undefined : page.blocks[blockIndex];
  if (block === undefined) return path.length <= 1 && page.blocks.length > 16 ? t('pageDesign.problem.tooManySections') : t('pageDesign.publishError');
  const section = quote(block.title, t('pageDesign.problem.untitledSection'));
  if (path[2] === 'title') return t('pageDesign.problem.sectionTitle', { section });
  if (path[2] === 'items' && typeof path[3] === 'number') {
    const item = block.items[path[3]];
    const name = quote(item?.title ?? '', t('pageDesign.problem.untitledItem'));
    if (path[4] === 'url') return t('pageDesign.problem.itemUrl', { section, item: name });
    if (path[4] === 'media') return t('pageDesign.problem.itemImage', { section, item: name });
    if (path[4] === 'title') return t('pageDesign.problem.itemTitle', { section });
    if (path[4] === 'price') return t('pageDesign.problem.itemPrice', { section, item: name });
  }
  if (path[2] === 'items') return t('pageDesign.problem.tooManyItems', { section });
  return t('pageDesign.problem.section', { section });
}
