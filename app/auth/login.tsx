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
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../src/theme';
import { useAuthStore } from '../../src/store/authStore';
import { useWalletStore } from '../../src/store/walletStore';
import { pullWalletsFromCloud, pushAllWalletsToCloud } from '../../src/lib/sync';

export default function LoginScreen() {
  const { theme } = useTheme();
  const signIn = useAuthStore((s) => s.signIn);
  const loading = useAuthStore((s) => s.loading);
  const hasCompletedOnboarding = useWalletStore((s) => s.hasCompletedOnboarding);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter both email and password.');
      return;
    }

    const { error } = await signIn(email.trim(), password.trim());
    if (error) {
      Alert.alert('Login failed', error);
      return;
    }

    // After login, try to pull wallets from cloud
    const user = useAuthStore.getState().user;
    if (user) {
      const pulled = await pullWalletsFromCloud(user.id);
      if (pulled) {
        // Cloud had wallets — go to dashboard
        router.replace('/dashboard');
      } else if (hasCompletedOnboarding) {
        // Local wallets exist but not in cloud — push them up
        await pushAllWalletsToCloud(user.id);
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
        <LinearGradient
          colors={[theme.accentPrimary, theme.accentSecondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.logoCircle}
        >
          <Text style={styles.logoText}>F</Text>
        </LinearGradient>
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
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logoText: {
    fontFamily: 'Sora_700Bold',
    fontSize: 28,
    color: '#0B0E14',
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
