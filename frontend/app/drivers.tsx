import React, { useCallback, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api/client';
import { Btn, Card, Field, H2, Muted } from '@/src/components/UI';
import { useToast } from '@/src/components/Toast';
import { COLORS, RADIUS, SHADOW, SPACING } from '@/src/theme/theme';

type Driver = { id: string; name: string };

export default function DriversScreen() {
  const toast = useToast();
  const [list, setList] = useState<Driver[]>([]);
  const [modal, setModal] = useState<{ open: boolean; editing?: Driver | null }>({ open: false });
  const [name, setName] = useState('');

  const load = async () => { try { setList(await api<Driver[]>('/drivers')); } catch {} };
  useFocusEffect(useCallback(() => { load(); }, []));

  const openCreate = () => { setName(''); setModal({ open: true, editing: null }); };
  const openEdit = (d: Driver) => { setName(d.name); setModal({ open: true, editing: d }); };

  const save = async () => {
    if (!name.trim()) { toast.show('Name is required', 'error'); return; }
    try {
      if (modal.editing) await api(`/drivers/${modal.editing.id}`, { method: 'PUT', body: JSON.stringify({ name }) });
      else await api('/drivers', { method: 'POST', body: JSON.stringify({ name }) });
      toast.show('Saved', 'success'); setModal({ open: false }); load();
    } catch (e: any) { toast.show(e.message, 'error'); }
  };
  const del = async (id: string) => { try { await api(`/drivers/${id}`, { method: 'DELETE' }); toast.show('Deleted', 'success'); load(); } catch (e: any) { toast.show(e.message, 'error'); } };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ title: 'Drivers', headerShown: true, headerStyle: { backgroundColor: COLORS.surface } as any, headerTintColor: COLORS.onSurface }} />
      <FlatList
        data={list}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 100 }}
        ListEmptyComponent={<Muted style={{ textAlign: 'center', marginTop: 48 }}>No drivers yet. Tap + to add.</Muted>}
        ItemSeparatorComponent={() => <View style={{ height: SPACING.sm }} />}
        renderItem={({ item }) => (
          <Card style={styles.row}>
            <View style={styles.avatar}><Ionicons name="person" size={18} color={COLORS.brandPrimary} /></View>
            <Text style={styles.name}>{item.name}</Text>
            <Pressable testID={`driver-edit-${item.id}`} onPress={() => openEdit(item)} style={styles.iconBtn}><Ionicons name="pencil" size={16} color={COLORS.brandPrimary} /></Pressable>
            <Pressable testID={`driver-delete-${item.id}`} onPress={() => del(item.id)} style={[styles.iconBtn, { backgroundColor: '#FEE2E2' }]}><Ionicons name="trash" size={16} color={COLORS.error} /></Pressable>
          </Card>
        )}
      />
      <Pressable testID="add-driver-fab" style={styles.fab} onPress={openCreate}><Ionicons name="add" size={28} color="#fff" /></Pressable>

      <Modal visible={modal.open} animationType="slide" transparent onRequestClose={() => setModal({ open: false })}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
          <Pressable style={styles.backdrop} onPress={() => setModal({ open: false })} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <ScrollView>
              <H2 style={{ marginBottom: SPACING.md }}>{modal.editing ? 'Edit Driver' : 'New Driver'}</H2>
              <Field label="Driver Name" value={name} onChangeText={setName} testID="driver-name-input" />
              <View style={{ flexDirection: 'row', gap: SPACING.md }}>
                <Btn title="Cancel" onPress={() => setModal({ open: false })} variant="ghost" style={{ flex: 1 }} testID="driver-cancel-button" />
                <Btn title="Save" onPress={save} style={{ flex: 1 }} testID="driver-save-button" />
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
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.onSurface },
  iconBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: COLORS.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  fab: { position: 'absolute', bottom: 30, right: SPACING.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.brandPrimary, alignItems: 'center', justifyContent: 'center', ...SHADOW },
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, padding: SPACING.lg, maxHeight: '85%' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.borderStrong, alignSelf: 'center', marginBottom: SPACING.md },
});
