/**
 * Publish card for unpublished section / appearance changes — the creds.id
 * web `PublishPanel` look: a bordered card whose `.sec-head` is a round chip
 * well with the upload glyph and the title, one line of intro, the button,
 * then an `.okbox` / `.warnbox` carrying what actually happened.
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
  | { readonly kind: 'error'; readonly reason: 'save' | 'relay' };

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
          <SfIcon name={done ? 'checkmark' : 'square.and.arrow.up'} size={16} color={c.primaryBlue} />
        </View>
        <ThemedText variant="titleMedium" style={{ flex: 1 }}>
          {t(done ? 'pageDesign.publishSuccess' : 'pageDesign.publishChanges')}
        </ThemedText>
        {done ? (
          <PressableScale
            haptic="tap"
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={t('common.done')}
            style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
            <SfIcon name="xmark" size={13} color={c.text2} />
          </PressableScale>
        ) : null}
      </View>

      {done ? (
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
      ) : (
        <>
          <ThemedText variant="bodySmall" tone="secondary">
            {t('pageDesign.publishHint')}
          </ThemedText>
          {state.kind === 'error' ? (
            <StatusBox
              tone="warn"
              text={t(state.reason === 'save' ? 'pageDesign.publishError' : 'pageDesign.publishRelayError')}
            />
          ) : null}
          <ThemedButton
            label={t(state.kind === 'error' ? 'mePage.retry' : 'pageDesign.publishButton')}
            icon="square.and.arrow.up"
            loading={state.kind === 'publishing'}
            fullWidth
            onPress={onPublish}
          />
        </>
      )}
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
