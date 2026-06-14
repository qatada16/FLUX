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

export default function SignUpScreen() {
  const { theme } = useTheme();
  const signUp = useAuthStore((s) => s.signUp);
  const loading = useAuthStore((s) => s.loading);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const handleSignUp = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter both email and password.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Password mismatch', 'Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }

    const { error } = await signUp(email.trim(), password.trim());
    if (error) {
      Alert.alert('Sign up failed', error);
      return;
    }

    Alert.alert(
      'Account created!',
      'Check your email to confirm your account, then sign in.',
      [{ text: 'OK', onPress: () => router.replace('/auth/login') }]
    );
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
        <Text style={[styles.title, { color: theme.textPrimary }]}>Create Account</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Sign up to back up your wallets to the cloud
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
          placeholder="Password (min. 6 characters)"
          placeholderTextColor={theme.textSecondary + '80'}
          secureTextEntry
        />
        <TextInput
          style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary }]}
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Confirm password"
          placeholderTextColor={theme.textSecondary + '80'}
          secureTextEntry
        />

        <Pressable
          onPress={handleSignUp}
          disabled={loading}
          style={({ pressed }) => [
            styles.submitBtn,
            { backgroundColor: theme.accentPrimary, opacity: pressed || loading ? 0.7 : 1 },
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#0B0E14" />
          ) : (
            <Text style={styles.submitText}>Create Account</Text>
          )}
        </Pressable>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: theme.textSecondary }]}>
          Already have an account?{' '}
        </Text>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.footerLink, { color: theme.accentPrimary }]}>Sign In</Text>
        </Pressable>
      </View>
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
    textAlign: 'center',
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
  },
  footerText: {
    fontFamily: 'Sora_400Regular',
    fontSize: 14,
  },
  footerLink: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 14,
  },
});
