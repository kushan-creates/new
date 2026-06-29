import React, { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/src/auth/AuthContext';
import { Btn, Field, H1 } from '@/src/components/UI';
import { useToast } from '@/src/components/Toast';
import { COLORS, RADIUS, SPACING } from '@/src/theme/theme';
import { saveToken } from '@/src/api/client';

const LAST_EMAIL_KEY = 'kushanji_last_email';
const BIO_ENABLED_KEY = 'kushanji_bio_enabled';
const BIO_TOKEN_KEY = 'kushanji_bio_token';

export default function Login() {
  const { signIn, refresh } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState('admin@kushanji.com');
  const [password, setPassword] = useState('Admin@123');
  const [loading, setLoading] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);

  useEffect(() => {
    (async () => {
      const last = await AsyncStorage.getItem(LAST_EMAIL_KEY);
      if (last) setEmail(last);
      const hasHw = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBioAvailable(hasHw && enrolled);
      const enabled = await AsyncStorage.getItem(BIO_ENABLED_KEY);
      setBioEnabled(enabled === '1');
    })();
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      await AsyncStorage.setItem(LAST_EMAIL_KEY, email.trim());
      // if biometrics enabled previously, refresh stored token for reuse
      const enabled = await AsyncStorage.getItem(BIO_ENABLED_KEY);
      if (enabled === '1') {
        const t = await import('@/src/api/client').then((m) => m.loadToken());
        if (t) await AsyncStorage.setItem(BIO_TOKEN_KEY, t);
      }
      router.replace('/(tabs)/dashboard');
    } catch (e: any) {
      toast.show(e.message || 'Login failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleBiometric = async () => {
    try {
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Kushan.Ji',
        fallbackLabel: 'Use Password',
      });
      if (!res.success) return;
      const token = await AsyncStorage.getItem(BIO_TOKEN_KEY);
      if (!token) {
        toast.show('Please log in once with password to enable biometric unlock', 'info');
        return;
      }
      await saveToken(token);
      await refresh();
      router.replace('/(tabs)/dashboard');
    } catch (e: any) {
      toast.show('Biometric failed', 'error');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.logoWrap}>
            <Image source={require('../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
          </View>
          <H1 style={styles.title}>Welcome Back</H1>
          <Text style={styles.subtitle}>Sign in to manage deliveries</Text>

          <View style={styles.form}>
            <Field
              label="Email"
              testID="login-email-input"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
            />
            <Field
              label="Password"
              testID="login-password-input"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
            />

            <Btn title="Sign In" onPress={handleLogin} loading={loading} testID="login-submit-button" />

            {bioAvailable && bioEnabled ? (
              <Pressable testID="login-biometric-button" style={styles.bioBtn} onPress={handleBiometric}>
                <Ionicons name="finger-print" size={22} color={COLORS.brandPrimary} />
                <Text style={styles.bioText}>Unlock with Biometrics</Text>
              </Pressable>
            ) : null}

            <View style={styles.demo} testID="login-demo-credentials">
              <Text style={styles.demoTitle}>Demo Accounts</Text>
              <Text style={styles.demoLine}>Admin · admin@kushanji.com / Admin@123</Text>
              <Text style={styles.demoLine}>User · user@kushanji.com / User@123</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.surface },
  container: { padding: SPACING.lg, paddingTop: SPACING.xl, flexGrow: 1 },
  logoWrap: {
    alignSelf: 'center',
    marginBottom: SPACING.xl,
  },
  logo: { width: 220, height: 110 },
  title: { textAlign: 'center', marginBottom: 4 },
  subtitle: { textAlign: 'center', color: COLORS.muted, marginBottom: SPACING.xl, fontSize: 14 },
  form: { gap: SPACING.xs },
  bioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.brandTertiary,
    marginTop: SPACING.md,
  },
  bioText: { color: COLORS.brandPrimary, fontWeight: '700' },
  demo: {
    marginTop: SPACING.xl,
    backgroundColor: COLORS.surfaceTertiary,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
  },
  demoTitle: { fontSize: 12, fontWeight: '700', color: COLORS.onSurfaceSecondary, marginBottom: 6 },
  demoLine: { fontSize: 12, color: COLORS.muted, marginVertical: 2 },
});
