/**
 * ModalSheet — the one wrapper for a React Native `Modal` presented as an
 * iOS sheet (`pageSheet` / `formSheet`; Android renders both full-window).
 *
 * Why it exists: `useSafeAreaInsets()` inside a bare `Modal` still reads the
 * ROOT `SafeAreaProvider`. The modal is a separate native view hierarchy the
 * root provider never measures, so every sheet that padded `insets.top`
 * reproduced the main window's status-bar inset (~59pt) at the top of a sheet
 * that already sits below the status bar — the "big empty band above the
 * header" (black in dark mode). Wrapping the content in its own
 * `SafeAreaProvider` makes the hook report the sheet's real insets: top 0 /
 * bottom = home indicator on iOS, the dialog window's insets on Android.
 *
 * `initialMetrics` seeds the first frame with those expected values so the
 * header doesn't jump once the native measurement lands mid-slide.
 *
 * Keyboard: content with inputs scrolls inside `KeyboardAwareScrollView`
 * (react-native-keyboard-controller — it tracks the keyboard inside `Modal`
 * on both platforms), never a plain `ScrollView`. Fixed layouts with a bottom
 * CTA use that library's `KeyboardAvoidingView` with `automaticOffset`, which
 * measures the view's true window position (a sheet is offset from the top).
 */
import type { ReactNode } from 'react';
import { Modal, Platform } from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaFrame,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

export type ModalSheetPresentation = 'pageSheet' | 'formSheet';

export interface ModalSheetProps {
  readonly visible: boolean;
  /** Android back button and iOS swipe-to-dismiss both land here. */
  readonly onRequestClose: () => void;
  readonly presentationStyle?: ModalSheetPresentation;
  /** iOS only: the dismissal animation finished (Android has no such event). */
  readonly onDismiss?: () => void;
  readonly children: ReactNode;
}

/** Top padding for sheet content that read the WINDOW's insets (a hook
 *  called outside the sheet): an iOS sheet already starts below the status
 *  bar, so padding by the window inset leaves an empty band at its top. */
export function sheetTopInset(windowTop: number): number {
  return Platform.OS === 'ios' ? 0 : windowTop;
}

export function ModalSheet({
  visible,
  onRequestClose,
  presentationStyle = 'pageSheet',
  onDismiss,
  children,
}: ModalSheetProps): ReactNode {
  const parentInsets = useSafeAreaInsets();
  const parentFrame = useSafeAreaFrame();
  // iOS sheets already sit below the status bar, so their own top inset is 0.
  // Android modals fill the window, so the root insets are the right seed.
  // iPad: a pageSheet is nearly the whole 13" screen; a formSheet is a
  // centred card, which is what these short sheets are. iPhone draws both
  // the same way, so the caller's choice only matters off-iPad.
  const presentation = Platform.OS === 'ios' && Platform.isPad ? 'formSheet' : presentationStyle;
  const initialMetrics = {
    insets: Platform.OS === 'ios' ? { ...parentInsets, top: 0 } : parentInsets,
    frame: parentFrame,
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={presentation}
      onRequestClose={onRequestClose}
      onDismiss={onDismiss}>
      <SafeAreaProvider initialMetrics={initialMetrics}>{children}</SafeAreaProvider>
    </Modal>
  );
}
