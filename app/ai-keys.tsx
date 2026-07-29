import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../src/theme';
import { showAppModal } from '../src/components/AppModal';
import { useAuthStore } from '../src/store/authStore';
import {
  useAiKeysStore,
  AI_PROVIDERS,
  AI_PROVIDER_LABELS,
  type AiProvider,
} from '../src/store/aiKeysStore';
import { pullAiKeys, pushAiKeys } from '../src/lib/aiKeysSync';

const HINTS: Record<AiProvider, string> = {
  cerebras: 'console.cerebras.ai',
  mistral: 'console.mistral.ai',
  gemini: 'aistudio.google.com',
  groq: 'console.groq.com',
};

export default function AiKeysScreen() {
  const { theme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const keys = useAiKeysStore((s) => s.keys);
  const usage = useAiKeysStore((s) => s.usage);
  const setKey = useAiKeysStore((s) => s.setKey);
  const resetUsage = useAiKeysStore((s) => s.resetUsage);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  // Pull the signed-in user's keys so this device shows their own values only.
  useEffect(() => {
    if (user) void pullAiKeys(user.id);
  }, [user?.id]);

  useEffect(() => {
    setDrafts(
      AI_PROVIDERS.reduce<Record<string, string>>((acc, p) => {
        acc[p] = keys[p] ?? '';
        return acc;
      }, {})
    );
  }, [keys]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    for (const p of AI_PROVIDERS) {
      setKey(p, drafts[p] ?? '');
    }
    const ok = await pushAiKeys(user.id);
    setSaving(false);
    Haptics.notificationAsync(
      ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning
    );
    showAppModal({
      title: ok ? 'Saved' : 'Saved on device',
      message: ok
        ? 'Your API keys are saved to your account.'
        : 'Keys are saved on this device and will sync when you are back online.',
    });
  };

  // Signed-out users have nowhere to store keys against, so gate the screen.
  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Header title="AI Detection" />
        <View style={styles.signedOut}>
          <Text style={[styles.signedOutTitle, { color: theme.textPrimary }]}>
            Sign in required
          </Text>
          <Text style={[styles.signedOutMsg, { color: theme.textSecondary }]}>
            API keys are stored against your account, so you need to be signed in to add them.
          </Text>
          <Pressable
            onPress={() => router.push('/auth/login')}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: theme.accentPrimary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={styles.primaryBtnText}>Sign In</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'android' ? 'height' : 'padding'}
    >
      <Header title="AI Detection" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.intro, { color: theme.textSecondary }]}>
          When Flux can't read a message on its own, it can ask an AI to parse it. Add a key for
          any provider — they're tried top to bottom. With no keys, messages are never sent to AI.
        </Text>

        {AI_PROVIDERS.map((p, i) => (
          <View
            key={p}
            style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.providerName, { color: theme.textPrimary }]}>
                  {i + 1}. {AI_PROVIDER_LABELS[p]}
                </Text>
                <Text style={[styles.providerHint, { color: theme.textSecondary }]}>
                  {HINTS[p]}
                </Text>
              </View>
              <View
                style={[styles.statusDot, { backgroundColor: keys[p] ? theme.success : theme.border }]}
              />
            </View>

            <View style={styles.inputRow}>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.surfaceElevated,
                    borderColor: theme.border,
                    color: theme.textPrimary,
                  },
                ]}
                value={drafts[p] ?? ''}
                onChangeText={(v) => setDrafts((prev) => ({ ...prev, [p]: v }))}
                placeholder="Paste API key"
                placeholderTextColor={theme.textSecondary + '70'}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!revealed[p]}
              />
              <Pressable
                onPress={() => setRevealed((prev) => ({ ...prev, [p]: !prev[p] }))}
                style={[styles.eyeBtn, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
              >
                <Text style={{ color: theme.textSecondary, fontSize: 16 }}>
                  {revealed[p] ? '🙈' : '👁'}
                </Text>
              </Pressable>
            </View>

            <View style={styles.usageRow}>
              <Text style={[styles.usageText, { color: theme.textSecondary }]}>
                Used <Text style={{ color: theme.accentTertiary }}>{usage[p] ?? 0}</Text> time
                {(usage[p] ?? 0) === 1 ? '' : 's'}
              </Text>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  resetUsage(p);
                  if (user) void pushAiKeys(user.id);
                }}
                style={({ pressed }) => [
                  styles.resetBtn,
                  { borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Text style={[styles.resetText, { color: theme.textSecondary }]}>Reset</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: theme.accentPrimary, opacity: pressed || saving ? 0.7 : 1 },
          ]}
        >
          <Text style={styles.primaryBtnText}>{saving ? 'Saving…' : 'Save Keys'}</Text>
        </Pressable>

        <View style={{ height: 30 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Header({ title }: { title: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()}>
        <Text style={[styles.backButton, { color: theme.accentTertiary }]}>← Back</Text>
      </Pressable>
      <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
      <View style={{ width: 50 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 56 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  backButton: { fontFamily: 'Sora_500Medium', fontSize: 15 },
  title: { fontFamily: 'Sora_700Bold', fontSize: 20 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  intro: {
    fontFamily: 'Sora_400Regular',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 18,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  providerName: { fontFamily: 'Sora_600SemiBold', fontSize: 15 },
  providerHint: { fontFamily: 'Sora_400Regular', fontSize: 11, marginTop: 2 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 46,
    fontFamily: 'Sora_400Regular',
    fontSize: 14,
  },
  eyeBtn: {
    width: 46,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  usageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  usageText: { fontFamily: 'Sora_500Medium', fontSize: 12 },
  resetBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  resetText: { fontFamily: 'Sora_600SemiBold', fontSize: 12 },
  primaryBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: { fontFamily: 'Sora_600SemiBold', fontSize: 16, color: '#0B0E14' },
  signedOut: { paddingHorizontal: 24, paddingTop: 40, alignItems: 'center' },
  signedOutTitle: { fontFamily: 'Sora_700Bold', fontSize: 18, marginBottom: 8 },
  signedOutMsg: {
    fontFamily: 'Sora_400Regular',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
});
