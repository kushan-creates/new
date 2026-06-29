import React, { useCallback, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api/client';
import { Btn, Card, Chip, Field, H2, Muted } from '@/src/components/UI';
import { useToast } from '@/src/components/Toast';
import { COLORS, RADIUS, SHADOW, SPACING } from '@/src/theme/theme';

type U = { id: string; name: string; email: string; role: 'admin' | 'user'; is_active: boolean };

export default function UsersScreen() {
  const toast = useToast();
  const [list, setList] = useState<U[]>([]);
  const [modal, setModal] = useState<{ kind: 'create' | 'reset' | null; user?: U }>({ kind: null });
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [role, setRole] = useState<'admin' | 'user'>('user');

  const load = async () => { try { setList(await api<U[]>('/users')); } catch (e: any) { toast.show(e.message, 'error'); } };
  useFocusEffect(useCallback(() => { load(); }, []));

  const openCreate = () => { setName(''); setEmail(''); setPassword(''); setRole('user'); setModal({ kind: 'create' }); };
  const openReset = (u: U) => { setPassword(''); setModal({ kind: 'reset', user: u }); };

  const save = async () => {
    try {
      if (modal.kind === 'create') {
        if (!name || !email || !password) { toast.show('Fill all fields', 'error'); return; }
        await api('/users', { method: 'POST', body: JSON.stringify({ name, email, password, role }) });
        toast.show('User created', 'success');
      } else if (modal.kind === 'reset' && modal.user) {
        if (!password) { toast.show('Enter a new password', 'error'); return; }
        await api(`/users/${modal.user.id}/reset-password`, { method: 'POST', body: JSON.stringify({ new_password: password }) });
        toast.show('Password reset', 'success');
      }
      setModal({ kind: null }); load();
    } catch (e: any) { toast.show(e.message, 'error'); }
  };

  const toggleActive = async (u: U) => {
    try { await api(`/users/${u.id}`, { method: 'PUT', body: JSON.stringify({ is_active: !u.is_active }) }); load(); }
    catch (e: any) { toast.show(e.message, 'error'); }
  };

  const del = async (u: U) => {
    try { await api(`/users/${u.id}`, { method: 'DELETE' }); toast.show('User deleted', 'success'); load(); }
    catch (e: any) { toast.show(e.message, 'error'); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ title: 'User Management', headerShown: true, headerStyle: { backgroundColor: COLORS.surface } as any, headerTintColor: COLORS.onSurface }} />
      <FlatList
        data={list}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 100 }}
        ItemSeparatorComponent={() => <View style={{ height: SPACING.sm }} />}
        renderItem={({ item }) => (
          <Card style={styles.row}>
            <View style={[styles.avatar, { backgroundColor: item.role === 'admin' ? COLORS.brandPrimary : COLORS.success }]}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>{item.name[0]?.toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Muted>{item.email} · {item.role.toUpperCase()} · {item.is_active ? 'Active' : 'Inactive'}</Muted>
            </View>
            <Pressable testID={`user-reset-${item.id}`} onPress={() => openReset(item)} style={styles.iconBtn}><Ionicons name="key" size={16} color={COLORS.brandPrimary} /></Pressable>
            <Pressable testID={`user-toggle-${item.id}`} onPress={() => toggleActive(item)} style={styles.iconBtn}><Ionicons name={item.is_active ? 'lock-open' : 'lock-closed'} size={16} color={COLORS.warning} /></Pressable>
            <Pressable testID={`user-delete-${item.id}`} onPress={() => del(item)} style={[styles.iconBtn, { backgroundColor: '#FEE2E2' }]}><Ionicons name="trash" size={16} color={COLORS.error} /></Pressable>
          </Card>
        )}
      />
      <Pressable testID="add-user-fab" style={styles.fab} onPress={openCreate}><Ionicons name="add" size={28} color="#fff" /></Pressable>

      <Modal visible={modal.kind !== null} animationType="slide" transparent onRequestClose={() => setModal({ kind: null })}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
          <Pressable style={styles.backdrop} onPress={() => setModal({ kind: null })} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <ScrollView>
              <H2 style={{ marginBottom: SPACING.md }}>{modal.kind === 'create' ? 'New User' : `Reset Password · ${modal.user?.name}`}</H2>
              {modal.kind === 'create' ? (
                <>
                  <Field label="Name" value={name} onChangeText={setName} testID="user-name-input" />
                  <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" testID="user-email-input" />
                  <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry testID="user-password-input" />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.muted, marginBottom: 6, textTransform: 'uppercase' }}>Role</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: SPACING.lg }}>
                    <Chip label="User" active={role === 'user'} onPress={() => setRole('user')} testID="user-role-user" />
                    <Chip label="Admin" active={role === 'admin'} onPress={() => setRole('admin')} testID="user-role-admin" />
                  </View>
                </>
              ) : (
                <Field label="New Password" value={password} onChangeText={setPassword} secureTextEntry testID="user-newpw-input" />
              )}
              <View style={{ flexDirection: 'row', gap: SPACING.md }}>
                <Btn title="Cancel" onPress={() => setModal({ kind: null })} variant="ghost" style={{ flex: 1 }} testID="user-cancel-button" />
                <Btn title="Save" onPress={save} style={{ flex: 1 }} testID="user-save-button" />
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: COLORS.onSurface },
  iconBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: COLORS.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  fab: { position: 'absolute', bottom: 30, right: SPACING.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.brandPrimary, alignItems: 'center', justifyContent: 'center', ...SHADOW },
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, padding: SPACING.lg, maxHeight: '85%' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.borderStrong, alignSelf: 'center', marginBottom: SPACING.md },
});
