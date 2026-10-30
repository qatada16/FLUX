import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView, AppState, Platform } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import type { File } from 'expo-file-system';
import { useTheme } from '../theme';
import { showAppModal } from './AppModal';
import {
  type AppRelease,
  cleanUpOldDownloads,
  downloadUpdate,
  fetchAvailableUpdate,
  formatBytes,
  installUpdate,
  installedVersion,
  openUpdateInBrowser,
} from '../lib/appUpdate';

// Re-check on returning to the app at most this often; a cold start always checks.
const RECHECK_INTERVAL_MS = 60 * 60 * 1000;

type Phase =
  | { kind: 'idle' }
  | { kind: 'downloading'; progress: number }
  | { kind: 'ready'; apk: File }
  | { kind: 'error'; message: string };

// --- Imperative bridge (same pattern as showAppModal) ------------------------
let manualCheck: (() => void) | null = null;

/** Settings → "Check for updates". Reports "up to date" when there is nothing. */
export function checkForUpdatesNow(): void {
  manualCheck?.();
}

/**
 * Shows the "update available" sheet whenever a newer build has been
 * published. Mount exactly once, at the app root.
 */
export function UpdatePrompt() {
  const { theme } = useTheme();
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const lastCheckAt = useRef(0);
  // "Later" hides an optional update until the next cold start.
  const dismissedCode = useRef(0);

  const check = useCallback(async (manual: boolean) => {
    lastCheckAt.current = Date.now();
    const found = await fetchAvailableUpdate().catch(() => null);
    if (!found) {
      if (manual) {
        const { name, code } = installedVersion();
        showAppModal({
          title: "You're up to date",
          message: `Flux ${name} (build ${code}) is the latest version.`,
        });
      }
      return;
    }
    if (!manual && !found.mandatory && found.versionCode <= dismissedCode.current) return;
    setRelease(found);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android' || __DEV__) return;
    cleanUpOldDownloads();
    void check(false);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastCheckAt.current > RECHECK_INTERVAL_MS) {
        void check(false);
      }
    });
    return () => sub.remove();
  }, [check]);

  useEffect(() => {
    manualCheck = () => void check(true);
    return () => {
      manualCheck = null;
    };
  }, [check]);

  const install = async (apk: File) => {
    try {
      await installUpdate(apk);
      // Back without installing — Android may first have asked for permission
      // to install apps. Leave the button ready for another go.
    } catch {
      setPhase({ kind: 'error', message: "Couldn't open the installer." });
    }
  };

  const startUpdate = async () => {
    if (!release) return;
    if (phase.kind === 'ready') {
      await install(phase.apk);
      return;
    }
    setPhase({ kind: 'downloading', progress: 0 });
    try {
      const apk = await downloadUpdate(release, (progress) =>
        setPhase((p) => (p.kind === 'downloading' ? { kind: 'downloading', progress } : p))
      );
      setPhase({ kind: 'ready', apk });
      await install(apk);
    } catch {
      setPhase({ kind: 'error', message: 'Download failed. Check your connection and try again.' });
    }
  };

  const later = () => {
    if (!release || release.mandatory) return;
    dismissedCode.current = release.versionCode;
    setRelease(null);
    setPhase({ kind: 'idle' });
  };

  if (!release) return null;

  const installed = installedVersion();
  const size = formatBytes(release.apkSizeBytes);
  const downloading = phase.kind === 'downloading';
  const primaryLabel =
    phase.kind === 'downloading'
      ? `Downloading… ${Math.round(phase.progress * 100)}%`
      : phase.kind === 'ready'
        ? 'Install'
        : phase.kind === 'error'
          ? 'Try again'
          : 'Update now';

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={later}>
      <Animated.View entering={FadeIn.duration(150)} style={styles.backdrop}>
        <Animated.View
          entering={ZoomIn.duration(180)}
          style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <View style={[styles.badge, { backgroundColor: theme.accentPrimary + '20' }]}>
            <Text style={[styles.badgeText, { color: theme.accentPrimary }]}>
              {release.mandatory ? 'REQUIRED UPDATE' : 'UPDATE AVAILABLE'}
            </Text>
          </View>
          <Text style={[styles.title, { color: theme.textPrimary }]}>
            Flux {release.versionName}
          </Text>
          <Text style={[styles.meta, { color: theme.textSecondary }]}>
            Build {release.versionCode}
            {size ? ` · ${size}` : ''} · You have {installed.name} (build {installed.code})
          </Text>

          {!!release.releaseNotes.trim() && (
            <ScrollView
              style={[styles.notes, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
              contentContainerStyle={styles.notesContent}
            >
              <Text style={[styles.notesTitle, { color: theme.textSecondary }]}>WHAT'S NEW</Text>
              <Text style={[styles.notesText, { color: theme.textPrimary }]}>
                {release.releaseNotes.trim()}
              </Text>
            </ScrollView>
          )}

          {downloading && (
            <View style={[styles.progressTrack, { backgroundColor: theme.surfaceElevated }]}>
              <View
                style={[
                  styles.progressFill,
                  { backgroundColor: theme.accentPrimary, width: `${Math.round(phase.progress * 100)}%` },
                ]}
              />
            </View>
          )}

          {phase.kind === 'ready' && (
            <Text style={[styles.hint, { color: theme.textSecondary }]}>
              If Android asks, allow Flux to install apps, then tap Install again. Your wallets and
              settings are kept.
            </Text>
          )}

          {phase.kind === 'error' && (
            <Text style={[styles.hint, { color: theme.danger }]}>{phase.message}</Text>
          )}

          <View style={styles.buttonRow}>
            {!release.mandatory && (
              <Pressable
                onPress={later}
                disabled={downloading}
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: theme.surfaceElevated, opacity: downloading ? 0.4 : pressed ? 0.8 : 1 },
                ]}
              >
                <Text style={[styles.buttonText, { color: theme.textSecondary }]}>Later</Text>
              </Pressable>
            )}
            <Pressable
              onPress={startUpdate}
              disabled={downloading}
              style={({ pressed }) => [
                styles.button,
                styles.primaryButton,
                { backgroundColor: theme.accentPrimary, opacity: downloading ? 0.7 : pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={[styles.buttonText, { color: '#0B0E14' }]}>{primaryLabel}</Text>
            </Pressable>
          </View>

          {(phase.kind === 'error' || phase.kind === 'ready') && (
            <Pressable onPress={() => void openUpdateInBrowser(release)} style={styles.linkButton}>
              <Text style={[styles.linkText, { color: theme.accentTertiary }]}>
                Download in browser instead
              </Text>
            </Pressable>
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 12,
  },
  badgeText: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 11,
    letterSpacing: 1,
  },
  title: {
    fontFamily: 'Sora_700Bold',
    fontSize: 20,
  },
  meta: {
    fontFamily: 'Sora_400Regular',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 16,
  },
  notes: {
    maxHeight: 220,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  notesContent: {
    padding: 14,
  },
  notesTitle: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 6,
  },
  notesText: {
    fontFamily: 'Sora_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  hint: {
    fontFamily: 'Sora_400Regular',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 14,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    flex: 2,
  },
  buttonText: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 15,
  },
  linkButton: {
    alignItems: 'center',
    paddingTop: 14,
  },
  linkText: {
    fontFamily: 'Sora_500Medium',
    fontSize: 13,
  },
});
