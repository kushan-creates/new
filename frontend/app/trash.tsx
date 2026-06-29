import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api/client';
import { Card, Muted } from '@/src/components/UI';
import { useToast } from '@/src/components/Toast';
import { COLORS, RADIUS, SPACING } from '@/src/theme/theme';

type Delivery = {
  id: string; date: string; time: string; customer_name: string; driver_name: string;
  product: string; quantity: number; unit: string; deleted_at?: string;
};

export default function TrashScreen() {
  const toast = useToast();
  const [list, setList] = useState<Delivery[]>([]);
  const load = async () => { try { setList(await api<Delivery[]>('/deliveries/trash')); } catch {} };
  useFocusEffect(useCallback(() => { load(); }, []));

  const restore = async (id: string) => {
    try { await api(`/deliveries/${id}/restore`, { method: 'POST' }); toast.show('Restored', 'success'); load(); }
    catch (e: any) { toast.show(e.message, 'error'); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ title: 'Trash (30 days)', headerShown: true, headerStyle: { backgroundColor: COLORS.surface } as any, headerTintColor: COLORS.onSurface }} />
      <FlatList
        data={list}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 100 }}
        ItemSeparatorComponent={() => <View style={{ height: SPACING.sm }} />}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 48 }}>
            <Ionicons name="trash-outline" size={48} color={COLORS.muted} />
            <Muted style={{ marginTop: SPACING.md }}>No deleted entries</Muted>
          </View>
        }
        renderItem={({ item }) => (
          <Card style={styles.row}>
            <View style={styles.icon}><Ionicons name="cube-outline" size={18} color={COLORS.error} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.product} · {item.quantity} {item.unit}</Text>
              <Muted>{item.customer_name} · {item.driver_name} · {item.date} {item.time}</Muted>
              {item.deleted_at ? <Muted style={{ fontSize: 11 }}>Deleted {new Date(item.deleted_at).toLocaleString()}</Muted> : null}
            </View>
            <Pressable testID={`trash-restore-${item.id}`} onPress={() => restore(item.id)} style={styles.restoreBtn}>
              <Ionicons name="refresh" size={16} color="#fff" />
              <Text style={styles.restoreText}>Restore</Text>
            </Pressable>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.lg },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 14, fontWeight: '700', color: COLORS.onSurface },
  restoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: COLORS.success },
  restoreText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
