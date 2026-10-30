/**
 * Editing chrome around one block of the Page preview, so blocks are edited
 * where they appear: tap the block to edit it, and its toolbar moves, hides
 * or removes it in place. An empty block (just added) and a hidden one still
 * show where they sit, as a dashed placeholder — what you see is the page.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { SFSymbol } from 'expo-symbols';

import { PressableScale } from '@/components/common/PressableScale';
import { SfIcon } from '@/components/icons/SfIcon';
import { ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { Radius } from '@/constants/radius';
import { useThemeColors } from '@/constants/useThemeColors';
import { useTranslation } from '@/i18n';
import type { PageBlock } from '@/page/pageDesign';

export interface PreviewBlockEditing {
  readonly onEdit: (block: PageBlock) => void;
  readonly onMove: (block: PageBlock, direction: 'up' | 'down') => void;
  readonly onToggleVisible: (block: PageBlock) => void;
  readonly onRemove: (block: PageBlock) => void;
}

export function PagePreviewBlockFrame({
  block,
  empty,
  canMoveUp,
  canMoveDown,
  editing,
  children,
}: {
  readonly block: PageBlock;
  /** No items yet: show where the block sits and invite filling it in. */
  readonly empty: boolean;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly editing: PreviewBlockEditing;
  readonly children: ReactNode;
}): ReactNode {
  const { t } = useTranslation();
  const c = useThemeColors();
  const kind = t(`pageDesign.block.${block.type}`);
  return (
    <View
      style={{
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: c.divider,
        borderRadius: Radius.group,
        padding: 8,
        gap: 4,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <ThemedText variant="caption" tone="tertiary" numberOfLines={1} style={{ flex: 1, paddingLeft: 4 }}>
          {block.visible ? kind : `${kind} · ${t('pageDesign.hiddenOnPage')}`}
        </ThemedText>
        <ToolButton
          icon="arrow.up"
          label={t('pageDesign.moveUp', { title: block.title })}
          disabled={!canMoveUp}
          onPress={() => { editing.onMove(block, 'up'); }}
        />
        <ToolButton
          icon="arrow.down"
          label={t('pageDesign.moveDown', { title: block.title })}
          disabled={!canMoveDown}
          onPress={() => { editing.onMove(block, 'down'); }}
        />
        <ToolButton
          icon={block.visible ? 'eye' : 'eye.slash'}
          label={t(block.visible ? 'pageDesign.hideSection' : 'pageDesign.showSection', { title: block.title })}
          onPress={() => { editing.onToggleVisible(block); }}
        />
        <ToolButton
          icon="trash"
          color={Colors.destructive}
          label={t('pageDesign.removeSectionNamed', { title: block.title })}
          onPress={() => { editing.onRemove(block); }}
        />
      </View>
      <PressableScale
        onPress={() => { editing.onEdit(block); }}
        accessibilityRole="button"
        accessibilityLabel={t('pageDesign.editSection', { title: block.title })}
        style={{ opacity: block.visible ? 1 : 0.45 }}>
        {children}
        {empty ? (
          <View
            style={{
              marginTop: 6,
              minHeight: 44,
              borderRadius: Radius.group,
              backgroundColor: c.searchBg,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}>
            <SfIcon name="plus" size={13} color={c.text2} />
            <ThemedText variant="caption" tone="secondary">
              {t('pageDesign.emptyBlockHint')}
            </ThemedText>
          </View>
        ) : null}
      </PressableScale>
    </View>
  );
}

function ToolButton({
  icon,
  label,
  color,
  disabled = false,
  onPress,
}: {
  readonly icon: SFSymbol;
  readonly label: string;
  readonly color?: string;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}): ReactNode {
  const c = useThemeColors();
  return (
    <PressableScale
      haptic="tap"
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={{
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.3 : 1,
      }}>
      <SfIcon name={icon} size={15} color={color ?? c.text2} />
    </PressableScale>
  );
}
