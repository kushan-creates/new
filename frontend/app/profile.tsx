import React, { useState } from 'react';
import { ScrollView, StyleSheet, View, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';

import { api, saveToken } from '@/src/api/client';
import { useAuth } from '@/src/auth/AuthContext';
import { Btn, Card, Field, H2, Muted } from '@/src/components/UI';
import { useToast } from '@/src/components/Toast';
import { COLORS, SPACING } from '@/src/theme/theme';

export default function ProfileScreen() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');

  const updateName = async () => {
    try { await api('/auth/change-name', { method: 'POST', body: JSON.stringify({ name }) }); await refresh(); toast.show('Name updated', 'success'); }
    catch (e: any) { toast.show(e.message, 'error'); }
  };

  const updateEmail = async () => {
    if (!currentPw) { toast.show('Enter current password to change email', 'error'); return; }
    try {
      await api('/auth/change-email', { method: 'POST', body: JSON.stringify({ current_password: currentPw, new_email: email }) });
      await refresh();
      toast.show('Email updated', 'success');
      setCurrentPw('');
    } catch (e: any) { toast.show(e.message, 'error'); }
  };

  const updatePassword = async () => {
    if (!currentPw || !newPw) { toast.show('Enter both current and new password', 'error'); return; }
    try {
      const res: any = await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ current_password: currentPw, new_password: newPw }) });
      if (res?.access_token) await saveToken(res.access_token);
      toast.show('Password updated', 'success');
      setCurrentPw(''); setNewPw('');
    } catch (e: any) { toast.show(e.message, 'error'); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ title: 'Profile', headerShown: true, headerStyle: { backgroundColor: COLORS.surface } as any, headerTintColor: COLORS.onSurface, headerBackTitle: 'Back' }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.lg }}>
          <Card>
            <H2>Display Name</H2>
            <View style={{ height: SPACING.md }} />
            <Field label="Full Name" value={name} onChangeText={setName} testID="profile-name-input" />
            <Btn title="Save Name" onPress={updateName} testID="profile-save-name-button" />
          </Card>

          <Card>
            <H2>Email (Login ID)</H2>
            <Muted>Used to sign in</Muted>
            <View style={{ height: SPACING.md }} />
            <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" testID="profile-email-input" />
            <Field label="Current Password" value={currentPw} onChangeText={setCurrentPw} secureTextEntry testID="profile-currentpw-input" />
            <Btn title="Update Email" onPress={updateEmail} variant="secondary" testID="profile-save-email-button" />
          </Card>

          <Card>
            <H2>Change Password</H2>
            <View style={{ height: SPACING.md }} />
            <Field label="Current Password" value={currentPw} onChangeText={setCurrentPw} secureTextEntry testID="profile-pwcurrent-input" />
            <Field label="New Password" value={newPw} onChangeText={setNewPw} secureTextEntry testID="profile-pwnew-input" />
            <Btn title="Change Password" onPress={updatePassword} variant="danger" testID="profile-change-password-button" />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: COLORS.surface } });
