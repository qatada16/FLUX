import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { showAppModal } from '../../src/components/AppModal';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../src/theme';
import { useAuthStore } from '../../src/store/authStore';
import { useWalletStore } from '../../src/store/walletStore';
import { pullWalletsFromCloud, flushPendingSync } from '../../src/lib/sync';

export default function LoginScreen() {
  const { theme } = useTheme();
  const signIn = useAuthStore((s) => s.signIn);
  const loading = useAuthStore((s) => s.loading);
  const hasCompletedOnboarding = useWalletStore((s) => s.hasCompletedOnboarding);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      showAppModal({ title: 'Missing fields', message: 'Please enter both email and password.' });
      return;
    }

    const { error } = await signIn(email.trim(), password.trim());
    if (error) {
      showAppModal({ title: 'Login failed', message: error });
      return;
    }

    // After login, try to pull wallets from cloud
    const user = useAuthStore.getState().user;
    if (user) {
      const result = await pullWalletsFromCloud(user.id);
      if (result === 'found') {
        // Cloud had wallets — push any pending local changes, then go.
        void flushPendingSync(user.id);
        router.replace('/dashboard');
      } else if (hasCompletedOnboarding) {
        // Local wallets exist but not in cloud (empty or fetch error) —
        // seed the cloud with them, then continue.
        await flushPendingSync(user.id, { force: true });
        router.replace('/dashboard');
      } else {
        // No wallets anywhere — run onboarding
        router.replace('/onboarding/welcome');
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'android' ? 'height' : 'padding'}
    >
      {/* Logo */}
      <View style={styles.logoArea}>
        <Image
          source={require('../../assets/FLUX.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />
        <Text style={[styles.title, { color: theme.textPrimary }]}>Welcome back</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Sign in to sync your wallets
        </Text>
      </View>

      {/* Form */}
      <View style={styles.form}>
        <TextInput
          style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary }]}
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={theme.textSecondary + '80'}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <TextInput
          style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary }]}
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={theme.textSecondary + '80'}
          secureTextEntry
          autoComplete="password"
        />

        <Pressable
          onPress={handleLogin}
          disabled={loading}
          style={({ pressed }) => [
            styles.submitBtn,
            { backgroundColor: theme.accentPrimary, opacity: pressed || loading ? 0.7 : 1 },
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#0B0E14" />
          ) : (
            <Text style={styles.submitText}>Sign In</Text>
          )}
        </Pressable>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: theme.textSecondary }]}>
          Don't have an account?{' '}
        </Text>
        <Pressable onPress={() => router.push('/auth/signup')}>
          <Text style={[styles.footerLink, { color: theme.accentPrimary }]}>Sign Up</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => router.replace('/onboarding/welcome')} style={styles.skipBtn}>
        <Text style={[styles.skipText, { color: theme.textSecondary }]}>
          Skip for now — use offline
        </Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  logoArea: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logoImage: {
    width: 110,
    height: 110,
    marginBottom: 8,
  },
  title: {
    fontFamily: 'Sora_700Bold',
    fontSize: 24,
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: 'Sora_400Regular',
    fontSize: 14,
  },
  form: {
    gap: 14,
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 52,
    fontFamily: 'Sora_400Regular',
    fontSize: 15,
  },
  submitBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  submitText: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 16,
    color: '#0B0E14',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
  },
  footerText: {
    fontFamily: 'Sora_400Regular',
    fontSize: 14,
  },
  footerLink: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 14,
  },
  skipBtn: {
    alignItems: 'center',
  },
  skipText: {
    fontFamily: 'Sora_400Regular',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});
