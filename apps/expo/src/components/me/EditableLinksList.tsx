import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { PressableScale } from '@/components/common/PressableScale';
import { BrandIcon } from '@/components/icons/BrandIcon';
import { SfIcon } from '@/components/icons/SfIcon';
import { ThemedButton, ThemedSurface, ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { fadeUpIn } from '@/feedback/motion';
import { useTranslation } from '@/i18n';
import {
  displayLinkText,
  linkInputModelFor,
  linkPresetForEditableUrl,
} from '@/profile/linkUrl';
import { brandIconForLink } from '@/profile/linkPresentation';

import type { LinkSheetValue } from './AddLinkSheet';
import { FIELD_ROW_STRIDE, ROW_GAP } from './pageRowStyles';
import { DraggableRow, resetRowDrag, RowDragHandle, useRowDragController } from './rowDrag';

const LINK_ROW_HEIGHT = 68;

export interface EditableLinkListItem extends LinkSheetValue {
  readonly id: string;
}

export interface EditableLinksListProps {
  readonly links: readonly EditableLinkListItem[];
  readonly onAdd: () => void;
  readonly onEdit: (id: string) => void;
  readonly onRemove: (id: string) => void;
  readonly onReorder: (sourceIndex: number, destinationIndex: number) => void;
  readonly onImportLinktree: () => void;
}

function linkSummary(link: EditableLinkListItem): string {
  const preset = linkPresetForEditableUrl(link.preset, link.url);
  const display = displayLinkText(preset, link.url);
  if (!linkInputModelFor(preset).handle) return display;
  return display.startsWith('@') ? display : `@${display}`;
}

export function EditableLinksList({
  links,
  onAdd,
  onEdit,
  onRemove,
  onReorder,
  onImportLinktree,
}: EditableLinksListProps): ReactNode {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const drag = useRowDragController();
  // Rows remount after a reorder (index-keyed, see rowDrag); only the first
  // mount fades in.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    setEntered(true);
  }, []);
  return (
    <View className="gap-3">
      <View className="min-h-11 flex-row items-center justify-between">
        <ThemedText variant="label">{t('meEdit.links')}</ThemedText>
        <PressableScale
          haptic="tap"
          onPress={onImportLinktree}
          accessibilityRole="button"
          accessibilityLabel={t('meEdit.importFromLinktree')}
          className="min-h-11 flex-row items-center justify-center gap-1 px-1">
          <SfIcon name="square.and.arrow.down" size={12} color={Colors.primaryBlue} />
          <ThemedText variant="caption" style={{ color: Colors.primaryBlue }}>
            {t('meEdit.importFromLinktree')}
          </ThemedText>
        </PressableScale>
      </View>

      <View style={{ gap: ROW_GAP }}>
        {links.map((link, index) => (
          <DraggableRow
            key={`${String(index)}-${link.id}`}
            controller={drag}
            index={index}
            stride={FIELD_ROW_STRIDE}>
            <Animated.View entering={entered || reduceMotion ? undefined : fadeUpIn(0)}>
              <ThemedSurface variant="outlined" className="flex-row">
                <PressableScale
                  fill
                  haptic="tap"
                  onPress={() => {
                    onEdit(link.id);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('meEdit.editLink', {
                    label: link.label.trim() || linkSummary(link),
                  })}
                  style={{
                    minHeight: LINK_ROW_HEIGHT,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingLeft: 12,
                    paddingVertical: 10,
                  }}>
                  <ThemedSurface
                    variant="inset"
                    className="h-9 w-9 items-center justify-center rounded-button">
                    <BrandIcon
                      name={brandIconForLink(link.label, link.url)}
                      size={16}
                      color={Colors.primaryBlue}
                    />
                  </ThemedSurface>
                  <View className="flex-1 gap-0.5">
                    <ThemedText variant="bodyMedium" numberOfLines={1}>
                      {link.label}
                    </ThemedText>
                    <ThemedText
                      variant="caption"
                      tone="tertiary"
                      numberOfLines={1}
                      ellipsizeMode="middle">
                      {linkSummary(link)}
                    </ThemedText>
                  </View>
                  <SfIcon name="pencil" size={13} color={Colors.text3} />
                </PressableScale>

                <View className="flex-row items-stretch">
                  <LinkAction
                    label={t('meEdit.removeLink')}
                    onPress={() => {
                      onRemove(link.id);
                    }}
                  />
                  <RowDragHandle
                    controller={drag}
                    label={t('mePage.reorderLink', { label: link.label.trim() || linkSummary(link) })}
                    index={index}
                    itemCount={links.length}
                    stride={FIELD_ROW_STRIDE}
                    height={LINK_ROW_HEIGHT}
                    disabled={links.length < 2}
                    onMove={(destination) => {
                      onReorder(index, destination);
                      // Same-task reset: the committed order and the identity
                      // transforms must reach the UI on the same frame.
                      resetRowDrag(drag);
                    }}>
                    <SfIcon name="line.3.horizontal" size={15} color={Colors.text3} />
                  </RowDragHandle>
                </View>
              </ThemedSurface>
            </Animated.View>
          </DraggableRow>
        ))}
      </View>

      <ThemedButton
        label={t('meEdit.addLink')}
        variant="secondary"
        icon="plus"
        onPress={onAdd}
      />
    </View>
  );
}

function LinkAction({
  label,
  onPress,
}: {
  readonly label: string;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <PressableScale
      haptic="warning"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: 44,
        minHeight: LINK_ROW_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <SfIcon name="trash" size={14} color={Colors.destructive} />
    </PressableScale>
  );
}
