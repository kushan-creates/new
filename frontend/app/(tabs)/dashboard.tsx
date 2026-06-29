import React, { useCallback, useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { api } from '@/src/api/client';
import { useAuth } from '@/src/auth/AuthContext';
import { Card, H2, Muted } from '@/src/components/UI';
import { COLORS, RADIUS, SHADOW, SPACING } from '@/src/theme/theme';

type Dash = {
  today_deliveries: number;
  today_quantity: number;
  today_customers: number;
  monthly_deliveries: number;
  monthly_quantity: number;
  top_customers: { id: string; name: string; quantity: number }[];
  top_products: { product: string; quantity: number }[];
  daily_analytics: { date: string; quantity: number; count: number }[];
};

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<Dash | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const d = await api<Dash>('/dashboard');
      setData(d);
    } catch {}
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const maxDaily = Math.max(1, ...(data?.daily_analytics.map((d) => d.quantity) || [1]));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.logoBox}>
            <Image source={require('../../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
          </View>
          <View style={{ flex: 1, marginLeft: SPACING.md }}>
            <Text style={styles.greeting}>Hello, {user?.name?.split(' ')[0] ?? 'there'}</Text>
            <Muted>{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</Muted>
          </View>
          <View style={[styles.roleBadge, { backgroundColor: user?.role === 'admin' ? COLORS.brandPrimary : COLORS.success }]}>
            <Text style={styles.roleText}>{user?.role?.toUpperCase()}</Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brandPrimary} />}
      >
        <View style={styles.kpiGrid}>
          <KpiCard icon="cube-outline" label="Today Deliveries" value={String(data?.today_deliveries ?? 0)} tint={COLORS.brandPrimary} testID="kpi-today-deliveries" />
          <KpiCard icon="scale-outline" label="Today Quantity" value={`${(data?.today_quantity ?? 0).toFixed(1)} kg`} tint={COLORS.success} testID="kpi-today-quantity" />
          <KpiCard icon="people-outline" label="Today Customers" value={String(data?.today_customers ?? 0)} tint={COLORS.warning} testID="kpi-today-customers" />
          <KpiCard icon="calendar-outline" label="Month Deliveries" value={String(data?.monthly_deliveries ?? 0)} tint={COLORS.brandSecondary} testID="kpi-month-deliveries" />
        </View>

        <Card style={styles.section}>
          <H2>Last 7 Days</H2>
          <Muted>Quantity delivered (kg)</Muted>
          <View style={styles.chart}>
            {(data?.daily_analytics || []).map((d) => (
              <View key={d.date} style={styles.chartCol}>
                <View style={styles.barWrap}>
                  <View style={[styles.bar, { height: `${Math.max(4, (d.quantity / maxDaily) * 100)}%` }]} />
                </View>
                <Text style={styles.chartLabel}>{d.date.slice(8, 10)}/{d.date.slice(5, 7)}</Text>
                <Text style={styles.chartValue}>{d.quantity.toFixed(0)}</Text>
              </View>
            ))}
          </View>
        </Card>

        <Card style={styles.section}>
          <H2>Top Customers (This Month)</H2>
          {(data?.top_customers || []).length === 0 ? (
            <Muted style={{ marginTop: 8 }}>No data yet</Muted>
          ) : (
            (data?.top_customers || []).map((c, idx) => (
              <View key={c.id} style={styles.row}>
                <View style={[styles.rank, { backgroundColor: idx === 0 ? COLORS.warning : COLORS.surfaceTertiary }]}>
                  <Text style={[styles.rankText, idx === 0 && { color: '#fff' }]}>{idx + 1}</Text>
                </View>
                <Text style={styles.rowName}>{c.name}</Text>
                <Text style={styles.rowValue}>{c.quantity.toFixed(1)} kg</Text>
              </View>
            ))
          )}
        </Card>

        <Card style={styles.section}>
          <H2>Top Products (This Month)</H2>
          {(data?.top_products || []).length === 0 ? (
            <Muted style={{ marginTop: 8 }}>No data yet</Muted>
          ) : (
            (data?.top_products || []).map((p, idx) => (
              <View key={p.product} style={styles.row}>
                <View style={[styles.rank, { backgroundColor: idx === 0 ? COLORS.success : COLORS.surfaceTertiary }]}>
                  <Ionicons name="restaurant-outline" size={16} color={idx === 0 ? '#fff' : COLORS.brandPrimary} />
                </View>
                <Text style={styles.rowName}>{p.product}</Text>
                <Text style={styles.rowValue}>{p.quantity.toFixed(1)} kg</Text>
              </View>
            ))
          )}
        </Card>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function KpiCard({ icon, label, value, tint, testID }: { icon: any; label: string; value: string; tint: string; testID?: string }) {
  return (
    <View style={styles.kpi} testID={testID}>
      <View style={[styles.kpiIcon, { backgroundColor: tint + '20' }]}>
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.surface },
  header: { padding: SPACING.lg, paddingBottom: SPACING.md, backgroundColor: COLORS.surface },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  logoBox: { width: 56, height: 36, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 56, height: 32 },
  greeting: { fontSize: 18, fontWeight: '800', color: COLORS.onSurface },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill },
  roleText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  scroll: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, marginBottom: SPACING.lg },
  kpi: {
    width: '47.5%', backgroundColor: COLORS.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.md, ...SHADOW,
  },
  kpiIcon: { width: 36, height: 36, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm },
  kpiValue: { fontSize: 22, fontWeight: '800', color: COLORS.onSurface },
  kpiLabel: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  section: { marginBottom: SPACING.lg },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 140, marginTop: SPACING.md, gap: 6 },
  chartCol: { flex: 1, alignItems: 'center' },
  barWrap: { width: '100%', height: 100, justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '70%', backgroundColor: COLORS.brandPrimary, borderRadius: 4 },
  chartLabel: { fontSize: 10, color: COLORS.muted, marginTop: 4 },
  chartValue: { fontSize: 11, color: COLORS.onSurface, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  rank: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md },
  rankText: { fontWeight: '800', color: COLORS.onSurface, fontSize: 13 },
  rowName: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.onSurface },
  rowValue: { fontSize: 14, fontWeight: '700', color: COLORS.brandPrimary },
});
