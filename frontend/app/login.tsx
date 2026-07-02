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
import { saveToken, loadToken } from '@/src/api/client';

const LAST_EMAIL_KEY = 'kushanji_last_email';
const BIO_TOKEN_KEY = 'kushanji_bio_token';
const BIO_EMAIL_KEY = 'kushanji_bio_email';

export default function Login() {
  const { signIn, refresh } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [bioReady, setBioReady] = useState(false);
  const [bioLabel, setBioLabel] = useState('Biometrics');
  const [bioSavedEmail, setBioSavedEmail] = useState<string | null>(null);

  // Detect hardware + saved token; show button whenever both are present
  useEffect(() => {
    (async () => {
      const last = await AsyncStorage.getItem(LAST_EMAIL_KEY);
      if (last) setEmail(last);

      if (Platform.OS === 'web') return; // biometrics not supported in browsers

      try {
        const hasHw = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (!hasHw || !enrolled) return;

        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) setBioLabel('Face ID');
        else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) setBioLabel('Fingerprint');
        else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) setBioLabel('Iris');
        else setBioLabel('Biometrics');

        const savedToken = await AsyncStorage.getItem(BIO_TOKEN_KEY);
        const savedEmail = await AsyncStorage.getItem(BIO_EMAIL_KEY);
        if (savedToken) {
          setBioReady(true);
          setBioSavedEmail(savedEmail);
        }
      } catch {
        // ignore — biometric is best-effort
      }
    })();
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      toast.show('Enter both email and password', 'error');
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      await AsyncStorage.setItem(LAST_EMAIL_KEY, email.trim());

      // Auto-save token for biometric unlock on native if hardware exists
      if (Platform.OS !== 'web') {
        try {
          const hasHw = await LocalAuthentication.hasHardwareAsync();
          const enrolled = await LocalAuthentication.isEnrolledAsync();
          if (hasHw && enrolled) {
            const t = await loadToken();
            if (t) {
              await AsyncStorage.setItem(BIO_TOKEN_KEY, t);
              await AsyncStorage.setItem(BIO_EMAIL_KEY, email.trim());
            }
          }
        } catch { /* ignore */ }
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
        promptMessage: `Unlock Kushan.Ji Namkeen with ${bioLabel}`,
        fallbackLabel: 'Use Password',
        disableDeviceFallback: false,
      });
      if (!res.success) {
        if (res.error && res.error !== 'user_cancel') toast.show(`Biometric ${res.error}`, 'error');
        return;
      }
      const token = await AsyncStorage.getItem(BIO_TOKEN_KEY);
      if (!token) {
        toast.show('Please log in with password once to enable biometric unlock', 'info');
        return;
      }
      await saveToken(token);
      try {
        await refresh();
        router.replace('/(tabs)/dashboard');
      } catch {
        // stored token expired; force password login
        await AsyncStorage.removeItem(BIO_TOKEN_KEY);
        toast.show('Session expired, please sign in with password', 'info');
        setBioReady(false);
      }
    } catch (e: any) {
      toast.show(e.message || 'Biometric failed', 'error');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.logoWrap}>
            <Image source={require('../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
          </View>
          <Text style={styles.brand}>Kushan.Ji Namkeen</Text>
          <H1 style={styles.title}>Welcome Back</H1>
          <Text style={styles.subtitle}>Sign in to manage deliveries</Text>

          <View style={styles.form}>
            <Field
              label="Username / Email"
              testID="login-email-input"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Enter your email"
            />
            <Field
              label="Password"
              testID="login-password-input"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Enter your password"
            />

            <Btn title="Sign In" onPress={handleLogin} loading={loading} testID="login-submit-button" />

            {bioReady ? (
              <>
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>OR</Text>
                  <View style={styles.dividerLine} />
                </View>
                <Pressable testID="login-biometric-button" style={styles.bioBtn} onPress={handleBiometric}>
                  <Ionicons name={bioLabel === 'Face ID' ? 'happy-outline' : 'finger-print'} size={24} color={COLORS.brandPrimary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bioTitle}>Unlock with {bioLabel}</Text>
                    {bioSavedEmail ? <Text style={styles.bioSub}>{bioSavedEmail}</Text> : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.brandPrimary} />
                </Pressable>
              </>
            ) : null}
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
    backgroundColor: '#000',
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  logo: { width: 180, height: 90 },
  brand: { textAlign: 'center', fontSize: 20, fontWeight: '800', color: COLORS.brandPrimary, letterSpacing: 0.5, marginBottom: 4 },
  title: { textAlign: 'center', marginBottom: 4 },
  subtitle: { textAlign: 'center', color: COLORS.muted, marginBottom: SPACING.xl, fontSize: 14 },
  form: { gap: SPACING.xs },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: SPACING.md, gap: SPACING.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { fontSize: 11, fontWeight: '700', color: COLORS.muted, letterSpacing: 1 },
  bioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 16,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.brandTertiary,
    borderWidth: 1,
    borderColor: COLORS.brandPrimary,
  },
  bioTitle: { color: COLORS.brandPrimary, fontWeight: '700', fontSize: 15 },
  bioSub: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  demo: {
    marginTop: SPACING.xl,
    backgroundColor: COLORS.surfaceTertiary,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
  },
  demoTitle: { fontSize: 12, fontWeight: '700', color: COLORS.onSurfaceSecondary, marginBottom: 6 },
  demoLine: { fontSize: 12, color: COLORS.muted, marginVertical: 4 },
});
