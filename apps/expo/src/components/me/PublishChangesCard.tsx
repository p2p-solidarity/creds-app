/**
 * Publish control for unpublished section / appearance changes: one button,
 * with an `.okbox` / `.warnbox` above it only when publishing failed or the
 * draft can't be signed. After a publish it becomes the creds.id web
 * `PublishPanel` result card (checkmark title + what actually happened).
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { PressableScale } from '@/components/common/PressableScale';
import { SfIcon } from '@/components/icons/SfIcon';
import { ThemedButton, ThemedText } from '@/components/themed';
import { Colors } from '@/constants/Colors';
import { Radius } from '@/constants/radius';
import { useThemeColors } from '@/constants/useThemeColors';
import { fadeUpIn } from '@/feedback/motion';
import { useTranslation } from '@/i18n';

import { iconTileStyle } from './pageRowStyles';

export type PublishCardState =
  | { readonly kind: 'pending' }
  | { readonly kind: 'publishing' }
  | { readonly kind: 'done'; readonly handle: string | null; readonly partial: boolean }
  /** `save`: signing the edited Page failed. `relay`: it is signed on this
   *  phone but no relay took it, so visitors still see the old Page. */
  | { readonly kind: 'error'; readonly reason: 'save' | 'relay' }
  /** The draft fails the schema; `problem` names what to fix. No retry
   *  until it is fixed — signing would only fail again. */
  | { readonly kind: 'blocked'; readonly problem: string };

export function PublishChangesCard({
  state,
  onPublish,
  onDismiss,
}: {
  readonly state: PublishCardState;
  readonly onPublish: () => void;
  readonly onDismiss: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const c = useThemeColors();
  const reduceMotion = useReducedMotion();
  const done = state.kind === 'done';

  // Unpublished changes are one button — the draft is already saved on this
  // phone; a box above it only when something stands in the way.
  if (!done) {
    return (
      <Animated.View entering={fadeUpIn(0, reduceMotion)} style={{ gap: 10 }}>
        {state.kind === 'error' ? (
          <StatusBox
            tone="warn"
            text={t(state.reason === 'save' ? 'pageDesign.publishError' : 'pageDesign.publishRelayError')}
          />
        ) : null}
        {state.kind === 'blocked' ? <StatusBox tone="warn" text={state.problem} /> : null}
        <ThemedButton
          label={t(state.kind === 'error' ? 'mePage.retry' : 'pageDesign.publishButton')}
          icon="square.and.arrow.up"
          loading={state.kind === 'publishing'}
          disabled={state.kind === 'blocked'}
          fullWidth
          onPress={onPublish}
        />
      </Animated.View>
    );
  }

  return (
    <Animated.View
      entering={fadeUpIn(0, reduceMotion)}
      style={{
        gap: 14,
        padding: 16,
        borderRadius: Radius.card,
        borderWidth: 1,
        borderColor: c.divider,
        backgroundColor: c.cardBg,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={iconTileStyle(c.chipSurface)}>
          <SfIcon name="checkmark" size={16} color={c.primaryBlue} />
        </View>
        <ThemedText variant="titleMedium" style={{ flex: 1 }}>
          {t('pageDesign.publishSuccess')}
        </ThemedText>
        <PressableScale
          haptic="tap"
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={t('common.done')}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <SfIcon name="xmark" size={13} color={c.text2} />
        </PressableScale>
      </View>

      <StatusBox
        tone={state.partial ? 'warn' : 'ok'}
        text={
          state.partial
            ? t('pageDesign.publishedPartially')
            : state.handle === null
              ? t('pageDesign.publishSuccess')
              : t('pageDesign.publishedAt', { handle: state.handle })
        }
      />
    </Animated.View>
  );
}

/** `.okbox` / `.warnbox`: 16% tint fill, 40% tint border, ink in the tone. */
function StatusBox({ tone, text }: { readonly tone: 'ok' | 'warn'; readonly text: string }): ReactNode {
  return (
    <View
      style={{
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: Radius.card,
        borderWidth: 1,
        borderColor: tone === 'ok' ? Colors.terminalGreenBorder : Colors.warning,
        backgroundColor: tone === 'ok' ? Colors.terminalGreenBg : Colors.chipSurface,
      }}>
      <ThemedText variant="bodySmall" style={{ color: tone === 'ok' ? Colors.terminalGreen : Colors.warningText }}>
        {text}
      </ThemedText>
    </View>
  );
}
