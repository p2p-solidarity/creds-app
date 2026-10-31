/**
 * PageLivePreview — the ONE Verified Page rendering in the app, ported from
 * `creds-design/verified-linkinbio-mock-v3.html` (`#s-public` / `.pub`).
 *
 * The same component paints three surfaces so they can never drift:
 *   • the Me tab's page preview          (`variant="editor"`)
 *   • the appearance sheet's live sample (`variant="editor"`)
 *   • a scanned visitor page             (`variant="public"`)
 *
 * Layout follows the mock 1:1 — avatar → name → handle → bio → link cards →
 * block sections → a quiet footer — with only the metrics scaled down for the
 * embedded editor sample. Public mode shows every signed item and opens safe
 * external URLs; editor mode stays a compact sample.
 *
 * Deliberately NOT ported: the mock's per-link "✓ 已驗證" seal. A signed
 * `ProfileLink` carries only `label` + `url`, so there is no per-link check
 * result to render and a decorative seal would be fake data (Rule 8).
 *
 * Row-level pieces live in `PagePreviewItems`, the header/footer in
 * `PagePreviewChrome`, and every measurement in `pagePreviewTheme`.
 */
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { cardSizeOf, type PageAppearance, type PageBlock } from '@/page/pageDesign';
import { richMediaForBlock } from '@/page/richMedia';
import type { ProfileRecord } from '@solidarity/shared';

import { useTranslation } from '@/i18n';

import { DraggableRow, RowDragArea, resetRowDrag, useRowDragController } from './rowDrag';
import { ROW_GAP } from './pageRowStyles';
import {
  PagePreviewEmpty,
  PagePreviewFooter,
  PagePreviewHeader,
  PagePreviewSectionTitle,
} from './PagePreviewChrome';
import {
  EmbedPlate,
  FeatureRow,
  ItemCapsule,
  LinkCard,
  MediaTile,
  PagePreviewMediaFacade,
  ShopRow,
  sized,
  type BlockRenderProps,
} from './PagePreviewItems';
import {
  PREVIEW_METRICS,
  blockItems,
  fontFor,
  paletteFor,
  type PageLivePreviewVariant,
  type PreviewItem,
} from './pagePreviewTheme';
import { ThemedText } from '@/components/themed';

/** The phone mock's screen corner — a device shape, not a UI surface role. */
export const PHONE_SCREEN_RADIUS = 24;

export type { PageLivePreviewVariant } from './pagePreviewTheme';

export interface PageLivePreviewProps {
  readonly record: ProfileRecord;
  readonly blocks: readonly PageBlock[];
  readonly appearance: PageAppearance;
  /** Public mode is the signed visitor surface: show every item and allow
   * safe external URLs to open. Editor mode remains a compact preview. */
  readonly variant?: PageLivePreviewVariant;
  /** Real, already-resolved page address (`creds.id/@name`). Rendered under
   * the display name exactly as the mock's `.pub-handle`; omitted entirely
   * when the caller has no address to show. */
  readonly handle?: string | null;
  /** The owner's Page tab: a tapped non-links block opens its editor and a
   *  long-pressed one drags to a new place; empty or hidden blocks still
   *  paint (hidden ones dimmed and tagged) so they can be found. Visitors
   *  never pass it. */
  readonly editing?: PreviewBlockEditing;
}

export interface PreviewBlockEditing {
  readonly onEdit: (block: PageBlock) => void;
  /** `destination` is a slot among the non-links blocks, links excluded. */
  readonly onMove: (block: PageBlock, destination: number) => void;
}

/** Travel per block before a block has measured itself; real heights win. */
const BLOCK_DRAG_STRIDE = 120;

export function PageLivePreview({
  record,
  blocks,
  appearance,
  variant = 'editor',
  handle = null,
  editing,
}: PageLivePreviewProps): ReactNode {
  const { t } = useTranslation();
  const drag = useRowDragController();
  const palette = paletteFor(appearance);
  const fontFamily = fontFor(appearance.font);
  const metrics = PREVIEW_METRICS[variant];
  const chrome = { palette, metrics, fontFamily, variant };
  const renderedBlocks = blocks.filter(
    (block) => (editing !== undefined && block.type !== 'links')
      || (block.visible && (block.type === 'leave-card' || blockItems(block, record).length > 0)),
  );

  const movable = editing === undefined ? [] : renderedBlocks.filter((block) => block.type !== 'links');

  const renderBody = (block: PageBlock): ReactNode => {
    const items = blockItems(block, record);
    const editable = editing !== undefined && block.type !== 'links';
    const empty = items.length === 0;
    return (
      <>
        {block.type === 'links' ? null : (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <PagePreviewSectionTitle title={block.title} palette={palette} fontFamily={fontFamily} />
            </View>
            {editable && !block.visible ? (
              <ThemedText variant="caption" style={{ color: palette.subtle, fontFamily }}>
                {t('pageDesign.hiddenOnPage')}
              </ThemedText>
            ) : null}
          </View>
        )}
        <PreviewBlockItems
          block={block}
          items={items}
          palette={palette}
          metrics={metrics}
          textColor={palette.text}
          fontFamily={fontFamily}
          variant={variant}
          emptyHint={editable && empty ? t('pageDesign.emptyBlockHint') : undefined}
        />
      </>
    );
  };

  const content = (
    <View
      style={{
        paddingTop: metrics.padTop,
        paddingHorizontal: metrics.padX,
        paddingBottom: metrics.padBottom,
      }}>
      <PagePreviewHeader record={record} handle={handle} {...chrome} />

      {renderedBlocks.length === 0 ? <PagePreviewEmpty {...chrome} /> : null}

      {(editing === undefined ? renderedBlocks : renderedBlocks.filter((block) => block.type === 'links')).map((block) => (
        <View key={block.id} style={{ marginTop: metrics.sectionGap }}>
          {renderBody(block)}
        </View>
      ))}

      {editing !== undefined && movable.length > 0 ? (
        // Rows sit exactly ROW_GAP apart (the drag's slot math); the rest
        // of the section gap is padding inside each row.
        <View style={{ marginTop: ROW_GAP, gap: ROW_GAP }}>
          {movable.map((block, index) => (
            <DraggableRow
              key={`${block.id}-${String(index)}`}
              controller={drag}
              index={index}
              stride={BLOCK_DRAG_STRIDE}
              style={{ paddingTop: metrics.sectionGap - ROW_GAP }}>
              <RowDragArea
                controller={drag}
                index={index}
                itemCount={movable.length}
                stride={BLOCK_DRAG_STRIDE}
                label={t('pageDesign.editSection', { title: block.title })}
                moveLabel={t('pageDesign.dragHint')}
                onPress={() => { editing.onEdit(block); }}
                onMove={(destination) => {
                  editing.onMove(block, destination);
                  resetRowDrag(drag);
                }}>
                <View style={{ opacity: block.visible ? 1 : 0.45 }}>{renderBody(block)}</View>
              </RowDragArea>
            </DraggableRow>
          ))}
        </View>
      ) : null}

      <PagePreviewFooter appearance={appearance} {...chrome} />
    </View>
  );

  return <PageGround appearance={appearance}>{content}</PageGround>;
}

/**
 * One block exactly as the Page paints it, on the Page's own ground — the
 * block editor's live card, so a title, item or style change shows at once.
 */
export function PageBlockPreview({
  block,
  record,
  appearance,
  emptyHint,
}: {
  readonly block: PageBlock;
  readonly record: ProfileRecord;
  readonly appearance: PageAppearance;
  /** Shown in the block's own shape while it has no items yet. */
  readonly emptyHint?: string;
}): ReactNode {
  const palette = paletteFor(appearance);
  const fontFamily = fontFor(appearance.font);
  const metrics = PREVIEW_METRICS.public;
  const items = blockItems(block, record);
  return (
    <PageGround appearance={appearance}>
      <View style={{ padding: metrics.padX, gap: 4 }}>
        <PagePreviewSectionTitle title={block.title} palette={palette} fontFamily={fontFamily} />
        <PreviewBlockItems
          block={block}
          items={items}
          palette={palette}
          metrics={metrics}
          textColor={palette.text}
          fontFamily={fontFamily}
          variant="public"
          emptyHint={emptyHint}
        />
      </View>
    </PageGround>
  );
}

/**
 * Some items of a block on the Page's ground, without the section title — a
 * single link's card in its action sheet, at the size the block uses.
 */
export function PageItemsPreview({
  block,
  items,
  appearance,
}: {
  readonly block: PageBlock;
  readonly items: readonly PreviewItem[];
  readonly appearance: PageAppearance;
}): ReactNode {
  const palette = paletteFor(appearance);
  const metrics = PREVIEW_METRICS.public;
  return (
    <PageGround appearance={appearance}>
      <View style={{ padding: metrics.padX }}>
        <PreviewBlockItems
          block={block}
          items={items}
          palette={palette}
          metrics={metrics}
          textColor={palette.text}
          fontFamily={fontFor(appearance.font)}
          variant="public"
        />
      </View>
    </PageGround>
  );
}

/** The ground is the web palette's: one stop is flat; the gradient template
 *  runs 165° and sun 180°, as `GRADIENT_GROUND` / `SUN_GROUND` do. */
function PageGround({
  appearance,
  children,
}: {
  readonly appearance: PageAppearance;
  readonly children: ReactNode;
}): ReactNode {
  const palette = paletteFor(appearance);
  const frame = { borderRadius: PHONE_SCREEN_RADIUS, overflow: 'hidden' as const };
  const [first = palette.cardBg, second, ...rest] = palette.stops;
  if (second === undefined) {
    return <View style={[frame, { backgroundColor: first }]}>{children}</View>;
  }
  const diagonal = appearance.template === 'gradient';
  return (
    <LinearGradient
      colors={[first, second, ...rest]}
      start={diagonal ? { x: 0.37, y: 0 } : { x: 0.5, y: 0 }}
      end={diagonal ? { x: 0.63, y: 1 } : { x: 0.5, y: 1 }}
      style={frame}>
      {children}
    </LinearGradient>
  );
}

function PreviewBlockItems({
  block,
  items,
  emptyHint,
  ...render
}: BlockRenderProps & {
  readonly block: PageBlock;
  readonly items: readonly PreviewItem[];
  /** Owner-only: an empty block still shows its shape, holding this hint. */
  readonly emptyHint?: string;
}): ReactNode {
  const { palette, metrics, textColor, fontFamily, variant } = render;
  const size = cardSizeOf(block);
  const sizedRender = { ...render, size };
  const visibleItems = variant === 'public' ? items : items.slice(0, 3);
  if (visibleItems.length === 0 && block.type !== 'leave-card') {
    if (emptyHint === undefined) return null;
    const hint = (
      <ThemedText variant="caption" style={{ color: palette.subtle, fontFamily, textAlign: block.style === 'card' ? 'center' : 'left' }}>
        {emptyHint}
      </ThemedText>
    );
    // A card-style block keeps its panel, so picking 卡片 shows a card.
    return block.style === 'card' ? (
      <View
        style={{
          alignItems: 'center',
          padding: 18,
          borderWidth: 1,
          borderColor: palette.cardBorder,
          borderRadius: palette.cardRadius,
          backgroundColor: palette.cardBg,
        }}>
        {hint}
      </View>
    ) : hint;
  }
  // Web `richOr`: a Spotify / YouTube item plays instead of being a row.
  const richOr = (item: PreviewItem, fallback: ReactNode): ReactNode => {
    const media = richMediaForBlock(block.type, item.url);
    return media === null ? fallback : (
      <PagePreviewMediaFacade
        key={item.id}
        media={media}
        title={item.title}
        palette={palette}
        fontFamily={fontFamily}
        size={size}
      />
    );
  };

  switch (block.style) {
    case 'plain':
      return (
        <View style={{ gap: 6 }}>
          {visibleItems.map((item) => (
            <ThemedText key={item.id} variant="bodyMedium" style={{ color: textColor, fontFamily }}>
              {item.title}
            </ThemedText>
          ))}
        </View>
      );
    case 'card':
      // `.leave-card` — a bordered, centred panel. A leave-card block carries
      // the CTA capsule; a text block reuses the same panel without one.
      return (
        <View
          style={{
            alignItems: 'center',
            gap: 10,
            padding: 18,
            borderWidth: 1,
            borderColor: palette.cardBorder,
            borderRadius: palette.cardRadius,
            backgroundColor: palette.cardBg,
          }}>
          {visibleItems.map((item) => (
            <ThemedText
              key={item.id}
              variant="bodyMedium"
              style={{ color: textColor, fontFamily, textAlign: 'center' }}>
              {item.title}
            </ThemedText>
          ))}
          {block.type === 'leave-card' ? (
            <ItemCapsule
              item={{ id: block.id, title: block.title }}
              palette={palette}
              fontFamily={fontFamily}
              variant={variant}
              filled
            />
          ) : null}
        </View>
      );
    case 'list':
      return (
        <View style={{ gap: metrics.cardGap }}>
          {visibleItems.map((item) => (
            block.type === 'shop'
              ? <ShopRow key={item.id} item={item} {...render} />
              : richOr(item, <LinkCard key={item.id} item={item} {...sizedRender} />)
          ))}
        </View>
      );
    case 'grid': {
      const columns = size === 'small' ? metrics.gridColumns + 1 : size === 'large' ? 2 : metrics.gridColumns;
      return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {visibleItems.map((item) => (
            <View
              key={item.id}
              style={{ width: `${100 / columns}%`, aspectRatio: 1, padding: 4 }}>
              <MediaTile item={item} {...render} />
            </View>
          ))}
        </View>
      );
    }
    case 'carousel': {
      const cards = visibleItems.map((item) => (
        <View key={item.id} style={{ width: sized(128, size), height: sized(128, size) }}>
          <MediaTile item={item} {...render} />
        </View>
      ));
      // A signed visitor page must expose every signed item, including cards
      // beyond the viewport. The editor remains a compact visual sample.
      return variant === 'public' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {cards}
        </ScrollView>
      ) : <View style={{ flexDirection: 'row', gap: 8, overflow: 'hidden' }}>{cards}</View>;
    }
    case 'large-card':
      // `.fe-card` — 76pt thumbnail beside title + secondary line.
      return (
        <View style={{ gap: metrics.cardGap }}>
          {(variant === 'public' ? visibleItems : visibleItems.slice(0, 1)).map((item) => (
            richOr(item, <FeatureRow key={item.id} item={item} thumbSize={sized(76, size)} {...render} />)
          ))}
        </View>
      );
    case 'embed':
      return (
        <View style={{ gap: metrics.cardGap }}>
          {(variant === 'public' ? visibleItems : visibleItems.slice(0, 1)).map((item) => (
            richOr(item, (
              <EmbedPlate
                key={item.id}
                item={item}
                palette={palette}
                fontFamily={fontFamily}
                variant={variant}
              />
            ))
          ))}
        </View>
      );
    case 'thumbnail':
      return (
        <View style={{ gap: metrics.cardGap }}>
          {visibleItems.map((item) => (
            richOr(item, <FeatureRow key={item.id} item={item} thumbSize={54} {...render} />)
          ))}
        </View>
      );
    case 'button':
      return (
        <View style={{ gap: metrics.cardGap }}>
          {visibleItems.map((item) => (
            <ItemCapsule
              key={item.id}
              item={item}
              palette={palette}
              fontFamily={fontFamily}
              variant={variant}
              filled
            />
          ))}
        </View>
      );
    case 'slots':
      // `.bkslot` — outlined capsules that wrap.
      return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {visibleItems.map((item) => (
            <ItemCapsule
              key={item.id}
              item={item}
              palette={palette}
              fontFamily={fontFamily}
              variant={variant}
              filled={false}
            />
          ))}
        </View>
      );
    default:
      return null;
  }
}
