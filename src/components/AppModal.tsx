import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { useTheme } from '../theme';

export interface AppModalButton {
  text: string;
  /** 'default' = accent, 'cancel' = muted, 'destructive' = danger. */
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface AppModalOptions {
  title: string;
  message?: string;
  buttons?: AppModalButton[];
}

// --- Imperative bridge -------------------------------------------------------
// showAppModal() can be called from anywhere (even non-React code like
// battery.ts / store actions), mirroring the ergonomics of Alert.alert but
// rendering with our theme. A single <AppModalHost/> mounted at the root
// listens for these calls.

type Listener = (opts: AppModalOptions | null) => void;
let listener: Listener | null = null;

export function showAppModal(options: AppModalOptions): void {
  if (listener) listener(options);
}

/**
 * Themed replacement for Alert.alert. Mount exactly once, at the app root.
 */
export function AppModalHost() {
  const { theme } = useTheme();
  const [options, setOptions] = useState<AppModalOptions | null>(null);

  useEffect(() => {
    listener = setOptions;
    return () => {
      listener = null;
    };
  }, []);

  const close = () => setOptions(null);

  const buttons: AppModalButton[] =
    options?.buttons && options.buttons.length > 0
      ? options.buttons
      : [{ text: 'OK', style: 'default' }];

  const handlePress = (btn: AppModalButton) => {
    close();
    // Defer so the modal unmount doesn't race the button's side effects.
    setTimeout(() => btn.onPress?.(), 0);
  };

  const visible = options !== null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={close}
    >
      {visible && (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(120)}
          style={styles.backdrop}
        >
          {/* Tap outside dismisses only if there's a single OK button */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={buttons.length === 1 ? close : undefined}
          />
          <Animated.View
            entering={ZoomIn.duration(180)}
            style={[
              styles.card,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.title, { color: theme.textPrimary }]}>
              {options?.title}
            </Text>
            {!!options?.message && (
              <Text style={[styles.message, { color: theme.textSecondary }]}>
                {options.message}
              </Text>
            )}

            <View
              style={[
                styles.buttonRow,
                buttons.length > 2 && styles.buttonColumn,
              ]}
            >
              {buttons.map((btn, i) => {
                const isDestructive = btn.style === 'destructive';
                const isCancel = btn.style === 'cancel';
                const bg = isDestructive
                  ? theme.danger + '18'
                  : isCancel
                    ? theme.surfaceElevated
                    : theme.accentPrimary;
                const fg = isDestructive
                  ? theme.danger
                  : isCancel
                    ? theme.textSecondary
                    : '#0B0E14';
                return (
                  <Pressable
                    key={`${btn.text}-${i}`}
                    onPress={() => handlePress(btn)}
                    style={({ pressed }) => [
                      styles.button,
                      buttons.length > 2 && styles.buttonFull,
                      { backgroundColor: bg, opacity: pressed ? 0.8 : 1 },
                    ]}
                  >
                    <Text style={[styles.buttonText, { color: fg }]}>
                      {btn.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>
        </Animated.View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
  },
  title: {
    fontFamily: 'Sora_700Bold',
    fontSize: 18,
    marginBottom: 8,
  },
  message: {
    fontFamily: 'Sora_400Regular',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  buttonColumn: {
    flexDirection: 'column-reverse',
  },
  button: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonFull: {
    width: '100%',
  },
  buttonText: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 15,
  },
});
