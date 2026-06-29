import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { api, loadToken } from '@/src/api/client';
import { useAuth } from '@/src/auth/AuthContext';
import { Card, H1, H2, Muted } from '@/src/components/UI';
import { useToast } from '@/src/components/Toast';
import { COLORS, RADIUS, SPACING } from '@/src/theme/theme';

const BIO_ENABLED_KEY = 'kushanji_bio_enabled';
const BIO_TOKEN_KEY = 'kushanji_bio_token';

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [settings, setSettings] = useState<any>(null);

  const load = async () => {
    try { setSettings(await api('/settings')); } catch {}
    const enabled = await AsyncStorage.getItem(BIO_ENABLED_KEY);
    setBioEnabled(enabled === '1');
    const hw = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    setBioAvailable(hw && enrolled);
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const toggleBio = async () => {
    if (!bioAvailable) { toast.show('Biometric hardware not available or not enrolled', 'error'); return; }
    if (!bioEnabled) {
      const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Enable biometric login' });
      if (!res.success) return;
      const token = await loadToken();
      if (token) await AsyncStorage.setItem(BIO_TOKEN_KEY, token);
      await AsyncStorage.setItem(BIO_ENABLED_KEY, '1');
      setBioEnabled(true);
      toast.show('Biometric login enabled', 'success');
    } else {
      await AsyncStorage.removeItem(BIO_ENABLED_KEY);
      await AsyncStorage.removeItem(BIO_TOKEN_KEY);
      setBioEnabled(false);
      toast.show('Biometric login disabled', 'info');
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem(BIO_TOKEN_KEY);
    await signOut();
    router.replace('/login');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.header}>
          <H1>Settings</H1>
        </View>

        <View style={{ paddingHorizontal: SPACING.lg }}>
          <Card style={styles.profile}>
            <View style={styles.logoBox}>
              <Image source={require('../../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
            </View>
            <View style={{ flex: 1, marginLeft: SPACING.md }}>
              <Text style={styles.name}>{user?.name}</Text>
              <Muted>{user?.email}</Muted>
              <View style={[styles.badge, { backgroundColor: user?.role === 'admin' ? COLORS.brandPrimary : COLORS.success }]}>
                <Text style={styles.badgeText}>{user?.role?.toUpperCase()}</Text>
              </View>
            </View>
          </Card>

          <Section title="Account">
            <Row icon="person-outline" label="Edit Profile & Credentials" testID="settings-row-profile" onPress={() => router.push('/profile')} />
            <Row icon="finger-print"
              label={`Biometric Login ${bioEnabled ? 'Enabled' : 'Disabled'}`}
              right={<View style={[styles.switch, bioEnabled && { backgroundColor: COLORS.brandPrimary }]}><View style={[styles.switchKnob, bioEnabled && { left: 22 }]} /></View>}
              testID="settings-row-bio"
              onPress={toggleBio}
            />
          </Section>

          <Section title="Master Data">
            <Row icon="people-outline" label="Customer Database" testID="settings-row-customers" onPress={() => router.push('/customers')} />
            <Row icon="bicycle-outline" label="Driver Database" testID="settings-row-drivers" onPress={() => router.push('/drivers')} />
            <Row icon="trash-outline" label="Deleted Deliveries (Trash)" testID="settings-row-trash" onPress={() => router.push('/trash')} />
          </Section>

          {user?.role === 'admin' ? (
            <Section title="Administration">
              <Row icon="shield-checkmark-outline" label="User Management" testID="settings-row-users" onPress={() => router.push('/users')} />
              <Row icon="document-text-outline" label="Audit Log" testID="settings-row-audit" onPress={() => router.push('/audit')} />
              <Row icon="business-outline" label={`Business: ${settings?.business_name || 'Kushan.Ji'}`} testID="settings-row-business" onPress={() => router.push('/business')} />
            </Section>
          ) : null}

          <Section title="About">
            <Row icon="information-circle-outline" label="Kushan.Ji DMS · v1.0" right={null} testID="settings-row-about" onPress={() => {}} />
          </Section>

          <Pressable testID="settings-logout-button" style={styles.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={18} color={COLORS.error} />
            <Text style={styles.logoutText}>Log Out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: SPACING.lg }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function Row({ icon, label, onPress, right, testID }: { icon: any; label: string; onPress: () => void; right?: React.ReactNode; testID?: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <View style={styles.rowIcon}><Ionicons name={icon} size={18} color={COLORS.brandPrimary} /></View>
      <Text style={styles.rowLabel}>{label}</Text>
      {right !== undefined ? right : <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.surface },
  header: { padding: SPACING.lg, paddingBottom: SPACING.sm },
  profile: { flexDirection: 'row', alignItems: 'center' },
  logoBox: { width: 60, height: 40, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 60, height: 36 },
  name: { fontSize: 17, fontWeight: '700', color: COLORS.onSurface },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill, marginTop: 6 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: COLORS.muted, marginLeft: SPACING.md, marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionCard: { backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.divider, gap: SPACING.md },
  rowIcon: { width: 32, height: 32, borderRadius: RADIUS.md, backgroundColor: COLORS.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.onSurface },
  switch: { width: 40, height: 22, borderRadius: 11, backgroundColor: COLORS.borderStrong, padding: 2, justifyContent: 'center' },
  switchKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', position: 'absolute', left: 2 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: SPACING.xl, padding: SPACING.md, backgroundColor: '#FEE2E2', borderRadius: RADIUS.md },
  logoutText: { color: COLORS.error, fontWeight: '700' },
});
