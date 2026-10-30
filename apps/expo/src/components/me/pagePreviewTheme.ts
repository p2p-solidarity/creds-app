/**
 * Verified Page preview theme — the `.pub` numbers from the creds-design mock
 * and the per-template colours of the creds.id web viewer, kept out of the
 * components so the editor sample and the visitor page can never drift apart.
 */
import { PageBackgroundGrounds, PagePalettes } from '@/constants/Colors';
import type { PageAppearance, PageBlock, PageBlockItem, PageTemplateId } from '@/page/pageDesign';
import type { ProfileRecord } from '@solidarity/shared';
import type { ViewStyle } from 'react-native';

export type PageLivePreviewVariant = 'editor' | 'public';

export type PreviewItem = Pick<PageBlockItem, 'id' | 'title' | 'url' | 'media' | 'price'>;

/** `.pub` metrics, and the same layout at embedded-editor density. */
export interface PreviewMetrics {
  readonly padTop: number;
  readonly padX: number;
  readonly padBottom: number;
  readonly avatar: number;
  readonly headerGap: number;
  readonly bioGap: number;
  readonly linkIcon: number;
  readonly cardPadV: number;
  readonly cardPadH: number;
  readonly cardGap: number;
  readonly sectionGap: number;
  readonly footerGap: number;
  readonly gridColumns: number;
}

export const PREVIEW_METRICS: Readonly<Record<PageLivePreviewVariant, PreviewMetrics>> = {
  public: {
    padTop: 52,
    padX: 24,
    padBottom: 40,
    avatar: 92,
    headerGap: 18,
    bioGap: 18,
    linkIcon: 44,
    cardPadV: 15,
    cardPadH: 16,
    cardGap: 12,
    sectionGap: 26,
    footerGap: 72,
    gridColumns: 3,
  },
  editor: {
    padTop: 24,
    padX: 16,
    padBottom: 18,
    avatar: 64,
    headerGap: 12,
    bioGap: 12,
    linkIcon: 36,
    cardPadV: 11,
    cardPadH: 12,
    cardGap: 9,
    sectionGap: 20,
    footerGap: 26,
    gridColumns: 3,
  },
};

/**
 * One appearance resolved to surfaces — airmeishi-web `paletteFor`
 * (`src/page/pageAppearance.ts`) over `PagePalettes`, so the preview paints
 * the same ground, cards and inks a visitor gets on creds.id. The legacy
 * field names (`text`, `subtle`, `iconBg` …) are kept for the row pieces.
 */
export interface PagePalette {
  /** Opaque ground stop(s); two or more draw a gradient. */
  readonly stops: readonly string[];
  readonly text: string;
  readonly subtle: string;
  readonly subtleOpacity: number;
  /** `--color-text3` — the footer's quiet ink. */
  readonly quiet: string;
  readonly accent: string;
  readonly cardBg: string;
  readonly cardBorder: string;
  readonly cardRadius: number;
  readonly iconBg: string;
  readonly iconTint: string;
  readonly placeholder: string;
  readonly onDark: boolean;
}

type TemplatePalette = (typeof PagePalettes)[PageTemplateId];

/** The background each template already stands on — a `background` equal to
 *  it is the default, not an override (web `TEMPLATE_NATIVE_BACKGROUND`). */
export const TEMPLATE_NATIVE_BACKGROUND: Readonly<Record<PageTemplateId, PageAppearance['background']>> = {
  cream: 'cream',
  ink: 'ink',
  journal: 'cream',
  gradient: 'cream',
  night: 'ink',
  mint: 'mint',
  sun: 'cream',
  minimal: 'white',
};

function toPalette(base: TemplatePalette, overrides: Partial<PagePalette> = {}): PagePalette {
  return {
    stops: base.stops,
    text: base.text1,
    subtle: base.text2,
    subtleOpacity: 1,
    quiet: base.text3,
    accent: base.accent,
    cardBg: base.card,
    cardBorder: base.border,
    cardRadius: base.cardRadius,
    iconBg: base.iconWell,
    iconTint: base.accent,
    placeholder: base.iconWell,
    onDark: base.onDark,
    ...overrides,
  };
}

/** Web `readableTextOn` — light ink once relative luminance is ≤ 0.4. Not the
 *  app's contrast helper: the viewer's threshold decides what visitors see. */
function groundIsDark(hex: string): boolean {
  const value = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/iu.test(value)) return false;
  const [r = 0, g = 0, b = 0] = [0, 2, 4]
    .map((i) => Number.parseInt(value.slice(i, i + 2), 16) / 255)
    .map((ch) => (ch <= 0.03928 ? ch / 12.92 : ((ch + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b <= 0.4;
}

/**
 * Lightness follows the ground (web CREDS.md §4 ruling 3): an overriding
 * `background` / `customBackground` that flips polarity flips the inks with
 * it, keeping only the template's card radius.
 */
export function paletteFor(appearance: PageAppearance): PagePalette {
  const base = PagePalettes[appearance.template];
  const override = appearance.customBackground
    ?? (appearance.background === TEMPLATE_NATIVE_BACKGROUND[appearance.template]
      ? null
      : PageBackgroundGrounds[appearance.background]);
  if (override === null) return toPalette(base);

  const onDark = groundIsDark(override);
  if (onDark === base.onDark) {
    return toPalette(base, { stops: [override], quiet: base.text2 });
  }
  const flipped = onDark ? PagePalettes.ink : PagePalettes.cream;
  return toPalette(flipped, { stops: [override], quiet: flipped.text2, cardRadius: base.cardRadius });
}

export function fontFor(font: PageAppearance['font']): string | undefined {
  switch (font) {
    case 'serif': return 'Georgia';
    case 'rounded': return 'Arial Rounded MT Bold';
    case 'mincho': return 'Hiragino Mincho ProN';
    case 'mono': return 'Courier';
    default: return undefined;
  }
}

/** `.link-card` / `.fe-card` / `.shop` share one bordered surface. */
export function previewCardStyle(palette: PagePalette, metrics: PreviewMetrics): ViewStyle {
  return {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: metrics.cardPadV,
    paddingHorizontal: metrics.cardPadH,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    borderRadius: palette.cardRadius,
    backgroundColor: palette.cardBg,
  };
}

/** Items a block renders — `links` reads the record, every other block type
 *  carries its own signed items. */
export function blockItems(block: PageBlock, record: ProfileRecord): readonly PreviewItem[] {
  if (block.type !== 'links') return block.items;
  return record.links.map((link) => ({ id: link.url, title: link.label, url: link.url }));
}
