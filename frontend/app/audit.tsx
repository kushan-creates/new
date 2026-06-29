import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api/client';
import { Card, Muted } from '@/src/components/UI';
import { COLORS, RADIUS, SPACING } from '@/src/theme/theme';

type Log = {
  id: string; user_name: string; role: string; action: string; resource: string; resource_id: string; timestamp: string; device?: string;
};

const ACTION_COLOR: Record<string, string> = {
  create: COLORS.success, update: COLORS.info, delete: COLORS.error, soft_delete: COLORS.error,
  restore: COLORS.warning, login: COLORS.brandPrimary, reset_password: COLORS.warning, change_password: COLORS.warning,
};

export default function AuditScreen() {
  const [list, setList] = useState<Log[]>([]);
  const load = async () => { try { setList(await api<Log[]>('/audit-logs')); } catch {} };
  useFocusEffect(useCallback(() => { load(); }, []));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ title: 'Audit Log', headerShown: true, headerStyle: { backgroundColor: COLORS.surface } as any, headerTintColor: COLORS.onSurface }} />
      <FlatList
        data={list}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 100 }}
        ItemSeparatorComponent={() => <View style={{ height: SPACING.sm }} />}
        ListEmptyComponent={<Muted style={{ textAlign: 'center', marginTop: 48 }}>No activity yet</Muted>}
        renderItem={({ item }) => (
          <Card style={styles.row}>
            <View style={[styles.dot, { backgroundColor: ACTION_COLOR[item.action] || COLORS.muted }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.act}>{item.action.replace(/_/g, ' ').toUpperCase()} · {item.resource}</Text>
              <Muted>{item.user_name} ({item.role}) · {new Date(item.timestamp).toLocaleString()}</Muted>
              {item.device ? <Muted style={{ fontSize: 11 }}>Device: {item.device}</Muted> : null}
            </View>
            <Ionicons name="document-text-outline" size={16} color={COLORS.muted} />
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.lg },
  dot: { width: 8, height: 8, borderRadius: 4 },
  act: { fontSize: 13, fontWeight: '800', color: COLORS.onSurface, letterSpacing: 0.4 },
});
