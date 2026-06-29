import React, { useCallback, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { api } from '@/src/api/client';
import { Btn, Card, Field, H2, Muted } from '@/src/components/UI';
import { useToast } from '@/src/components/Toast';
import { COLORS, RADIUS, SHADOW, SPACING } from '@/src/theme/theme';

type Customer = { id: string; name: string; mobile: string; whatsapp: string };

export default function CustomersScreen() {
  const toast = useToast();
  const [list, setList] = useState<Customer[]>([]);
  const [modal, setModal] = useState<{ open: boolean; editing?: Customer | null }>({ open: false });
  const [name, setName] = useState(''); const [mobile, setMobile] = useState(''); const [whatsapp, setWhatsapp] = useState('');

  const load = async () => { try { setList(await api<Customer[]>('/customers')); } catch {} };
  useFocusEffect(useCallback(() => { load(); }, []));

  const openCreate = () => { setName(''); setMobile(''); setWhatsapp(''); setModal({ open: true, editing: null }); };
  const openEdit = (c: Customer) => { setName(c.name); setMobile(c.mobile); setWhatsapp(c.whatsapp); setModal({ open: true, editing: c }); };

  const save = async () => {
    if (!name.trim()) { toast.show('Name is required', 'error'); return; }
    try {
      const body = { name, mobile, whatsapp: whatsapp || mobile };
      if (modal.editing) await api(`/customers/${modal.editing.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await api('/customers', { method: 'POST', body: JSON.stringify(body) });
      toast.show('Saved', 'success'); setModal({ open: false }); load();
    } catch (e: any) { toast.show(e.message, 'error'); }
  };
  const del = async (id: string) => { try { await api(`/customers/${id}`, { method: 'DELETE' }); toast.show('Deleted', 'success'); load(); } catch (e: any) { toast.show(e.message, 'error'); } };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ title: 'Customers', headerShown: true, headerStyle: { backgroundColor: COLORS.surface } as any, headerTintColor: COLORS.onSurface }} />
      <FlatList
        data={list}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 100 }}
        ListEmptyComponent={<Muted style={{ textAlign: 'center', marginTop: 48 }}>No customers yet. Tap + to add.</Muted>}
        ItemSeparatorComponent={() => <View style={{ height: SPACING.sm }} />}
        renderItem={({ item }) => (
          <Card style={styles.row}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{item.name[0]?.toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Muted>{item.mobile || '—'} · WA: {item.whatsapp || '—'}</Muted>
            </View>
            <Pressable testID={`customer-edit-${item.id}`} onPress={() => openEdit(item)} style={styles.iconBtn}><Ionicons name="pencil" size={16} color={COLORS.brandPrimary} /></Pressable>
            <Pressable testID={`customer-delete-${item.id}`} onPress={() => del(item.id)} style={[styles.iconBtn, { backgroundColor: '#FEE2E2' }]}><Ionicons name="trash" size={16} color={COLORS.error} /></Pressable>
          </Card>
        )}
      />
      <Pressable testID="add-customer-fab" style={styles.fab} onPress={openCreate}><Ionicons name="add" size={28} color="#fff" /></Pressable>

      <Modal visible={modal.open} animationType="slide" transparent onRequestClose={() => setModal({ open: false })}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
          <Pressable style={styles.backdrop} onPress={() => setModal({ open: false })} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <ScrollView>
              <H2 style={{ marginBottom: SPACING.md }}>{modal.editing ? 'Edit Customer' : 'New Customer'}</H2>
              <Field label="Name" value={name} onChangeText={setName} testID="customer-name-input" />
              <Field label="Mobile Number" value={mobile} onChangeText={setMobile} keyboardType="phone-pad" testID="customer-mobile-input" />
              <Field label="WhatsApp Number" value={whatsapp} onChangeText={setWhatsapp} keyboardType="phone-pad" placeholder="Leave blank to reuse mobile" testID="customer-whatsapp-input" />
              <View style={{ flexDirection: 'row', gap: SPACING.md }}>
                <Btn title="Cancel" onPress={() => setModal({ open: false })} variant="ghost" style={{ flex: 1 }} testID="customer-cancel-button" />
                <Btn title="Save" onPress={save} style={{ flex: 1 }} testID="customer-save-button" />
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
  avatarText: { color: COLORS.brandPrimary, fontWeight: '800' },
  name: { fontSize: 15, fontWeight: '700', color: COLORS.onSurface },
  iconBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: COLORS.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  fab: { position: 'absolute', bottom: 30, right: SPACING.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.brandPrimary, alignItems: 'center', justifyContent: 'center', ...SHADOW },
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, padding: SPACING.lg, maxHeight: '85%' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.borderStrong, alignSelf: 'center', marginBottom: SPACING.md },
});
