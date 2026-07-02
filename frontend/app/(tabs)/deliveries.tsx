import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { api } from '@/src/api/client';
import { Btn, Card, Chip, Field, H1, H2, Muted } from '@/src/components/UI';
import { useToast } from '@/src/components/Toast';
import { COLORS, RADIUS, SHADOW, SPACING } from '@/src/theme/theme';

type Customer = { id: string; name: string; mobile: string; whatsapp: string };
type Driver = { id: string; name: string };
type AppSettings = { default_unit: string; default_products: string[]; business_name: string };
type Delivery = {
  id: string;
  date: string;
  time: string;
  customer_id: string;
  driver_id: string;
  customer_name: string;
  customer_mobile: string;
  customer_whatsapp: string;
  driver_name: string;
  product: string;
  quantity: number;
  unit: string;
  remarks?: string;
};

const BASE_UNITS = ['kg']; // used only as safety fallback if user hasn't configured any default unit

export default function DeliveriesScreen() {
  const toast = useToast();
  const [items, setItems] = useState<Delivery[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [modal, setModal] = useState<{ open: boolean; editing?: Delivery | null }>({ open: false });

  const load = async () => {
    try {
      const [list, c, d, s] = await Promise.all([
        api<Delivery[]>('/deliveries'),
        api<Customer[]>('/customers'),
        api<Driver[]>('/drivers'),
        api<AppSettings>('/settings'),
      ]);
      setItems(list);
      setCustomers(c);
      setDrivers(d);
      setSettings(s);
    } catch (e: any) {
      toast.show(e.message || 'Failed to load', 'error');
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const filtered = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const monthStart = today.slice(0, 7) + '-01';
    let out = items;
    if (filter === 'today') out = out.filter((d) => d.date === today);
    else if (filter === 'week') out = out.filter((d) => d.date >= weekAgo);
    else if (filter === 'month') out = out.filter((d) => d.date >= monthStart);
    if (search) {
      const q = search.toLowerCase();
      out = out.filter((d) =>
        d.customer_name.toLowerCase().includes(q) ||
        d.driver_name.toLowerCase().includes(q) ||
        d.product.toLowerCase().includes(q),
      );
    }
    return out;
  }, [items, filter, search]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleDelete = async (d: Delivery) => {
    try {
      await api(`/deliveries/${d.id}`, { method: 'DELETE' });
      toast.show('Delivery deleted', 'success');
      load();
    } catch (e: any) {
      toast.show(e.message, 'error');
    }
  };

  const sendWhatsApp = async (d: Delivery) => {
    // build today report for that customer
    const todayItems = items.filter((x) => x.customer_id === d.customer_id && x.date === d.date);
    const total = todayItems.reduce((s, x) => s + x.quantity, 0);
    const dateStr = new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    let msg = `*Kushan.Ji Delivery Report*\n\nCustomer: ${d.customer_name}\nDate: ${dateStr}\n\n`;
    todayItems.sort((a, b) => a.time.localeCompare(b.time));
    todayItems.forEach((x) => {
      msg += `${x.time}\nDriver: ${x.driver_name}\nProduct: ${x.product}\nQuantity: ${x.quantity} ${x.unit}\n\n`;
    });
    msg += `*Total Today: ${total} ${d.unit}*`;
    const phone = (d.customer_whatsapp || d.customer_mobile || '').replace(/\D/g, '');
    if (!phone) {
      toast.show('No WhatsApp number for this customer', 'error');
      return;
    }
    const url = `https://wa.me/${phone.startsWith('91') || phone.length > 10 ? phone : '91' + phone}?text=${encodeURIComponent(msg)}`;
    const ok = await Linking.canOpenURL(url);
    if (ok) Linking.openURL(url);
    else toast.show('Cannot open WhatsApp', 'error');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <H1>Deliveries</H1>
        <Muted>{filtered.length} entries</Muted>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={COLORS.muted} />
          <Field
            testID="deliveries-search-input"
            value={search}
            onChangeText={setSearch}
            placeholder="Search customer, driver, product…"
            style={{ flex: 1, marginBottom: 0 }}
          />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {(['all', 'today', 'week', 'month'] as const).map((f) => (
          <Chip key={f} label={f.toUpperCase()} active={filter === f} onPress={() => setFilter(f)} testID={`filter-chip-${f}`} />
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brandPrimary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={64} color={COLORS.muted} />
            <Text style={styles.emptyTitle}>No deliveries yet</Text>
            <Muted>Tap the + button to log your first delivery</Muted>
          </View>
        }
        renderItem={({ item }) => (
          <Card style={styles.deliveryCard}>
            <View style={styles.deliveryHead}>
              <View style={styles.deliveryIcon}>
                <Ionicons name="cube" size={20} color={COLORS.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dCustomer}>{item.customer_name}</Text>
                <Text style={styles.dDriver}>{item.driver_name} · {item.date} · {item.time}</Text>
              </View>
              <View style={styles.qtyBadge}>
                <Text style={styles.qtyText}>{item.quantity} {item.unit}</Text>
              </View>
            </View>
            <View style={styles.dBody}>
              <Text style={styles.product}>{item.product}</Text>
              {item.remarks ? <Muted style={{ marginTop: 4 }}>{item.remarks}</Muted> : null}
            </View>
            <View style={styles.actions}>
              <Pressable testID={`delivery-whatsapp-${item.id}`} style={[styles.actionBtn, { backgroundColor: COLORS.whatsapp }]} onPress={() => sendWhatsApp(item)}>
                <Ionicons name="logo-whatsapp" size={16} color="#fff" />
                <Text style={styles.actionText}>WhatsApp</Text>
              </Pressable>
              <Pressable testID={`delivery-edit-${item.id}`} style={[styles.actionBtn, { backgroundColor: COLORS.brandTertiary }]} onPress={() => setModal({ open: true, editing: item })}>
                <Ionicons name="pencil" size={16} color={COLORS.brandPrimary} />
                <Text style={[styles.actionText, { color: COLORS.brandPrimary }]}>Edit</Text>
              </Pressable>
              <Pressable testID={`delivery-delete-${item.id}`} style={[styles.actionBtn, { backgroundColor: '#FEE2E2' }]} onPress={() => handleDelete(item)}>
                <Ionicons name="trash" size={16} color={COLORS.error} />
                <Text style={[styles.actionText, { color: COLORS.error }]}>Delete</Text>
              </Pressable>
            </View>
          </Card>
        )}
        ItemSeparatorComponent={() => <View style={{ height: SPACING.md }} />}
      />

      <Pressable
        testID="add-delivery-fab"
        style={styles.fab}
        onPress={() => setModal({ open: true, editing: null })}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      {modal.open ? (
        <DeliveryForm
          customers={customers}
          drivers={drivers}
          settings={settings}
          editing={modal.editing}
          onClose={() => setModal({ open: false })}
          onSaved={() => { setModal({ open: false }); load(); }}
        />
      ) : null}
    </SafeAreaView>
  );
}

function DeliveryForm({
  customers, drivers, settings, editing, onClose, onSaved,
}: {
  customers: Customer[]; drivers: Driver[]; settings: AppSettings | null; editing?: Delivery | null; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const defaultTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const defaultUnit = editing?.unit
    || (settings?.default_unit || '').split(',').map((s) => s.trim()).filter(Boolean)[0]
    || 'kg';
  const defaultProducts = settings?.default_products || [];
  const defaultProduct = editing?.product || defaultProducts[0] || '';
  const [date, setDate] = useState(editing?.date || new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(editing?.time || defaultTime);
  const [customerId, setCustomerId] = useState(editing?.customer_id || customers[0]?.id || '');
  const [driverId, setDriverId] = useState(editing?.driver_id || drivers[0]?.id || '');
  const [product, setProduct] = useState(defaultProduct);
  const [quantity, setQuantity] = useState(editing?.quantity ? String(editing.quantity) : '');
  const [unit, setUnit] = useState(defaultUnit);
  const [remarks, setRemarks] = useState(editing?.remarks || '');
  const [saving, setSaving] = useState(false);

  // Merge configured default unit into the unit chip list (dedup, preserve order).
  // Only the units the user has configured in Business Settings are shown — no built-ins.
  // The user can enter comma-separated units in settings.default_unit to expose multiple.
  const unitOptions = useMemo(() => {
    const list: string[] = [];
    const add = (u?: string) => { const t = (u || '').trim(); if (t && !list.includes(t)) list.push(t); };
    (settings?.default_unit || '').split(',').forEach(add);
    if (list.length === 0) BASE_UNITS.forEach(add); // safety fallback
    add(unit); // ensure current selection is always in the list
    return list;
  }, [settings?.default_unit, unit]);

  useEffect(() => {
    if (!editing) {
      if (!customerId && customers[0]) setCustomerId(customers[0].id);
      if (!driverId && drivers[0]) setDriverId(drivers[0].id);
    }
  }, [customers, drivers, editing, customerId, driverId]);

  const save = async () => {
    if (!customerId || !driverId || !product || !quantity) {
      toast.show('Please fill all required fields', 'error');
      return;
    }
    setSaving(true);
    try {
      const body = {
        date, time, customer_id: customerId, driver_id: driverId, product,
        quantity: parseFloat(quantity), unit, remarks,
      };
      if (editing) {
        await api(`/deliveries/${editing.id}`, { method: 'PUT', body: JSON.stringify(body) });
        toast.show('Delivery updated', 'success');
      } else {
        const res: any = await api('/deliveries', { method: 'POST', body: JSON.stringify(body) });
        if (res?.duplicate_warning) toast.show('Saved (similar entry already exists today)', 'info');
        else toast.show('Delivery saved', 'success');
      }
      onSaved();
    } catch (e: any) {
      toast.show(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={{ paddingBottom: SPACING.xl }}>
            <H2 style={{ marginBottom: SPACING.md }}>{editing ? 'Edit Delivery' : 'New Delivery'}</H2>

            <View style={{ flexDirection: 'row', gap: SPACING.md }}>
              <Field label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" style={{ flex: 1 }} testID="delivery-date-input" />
              <Field label="Time (HH:MM)" value={time} onChangeText={setTime} placeholder="HH:MM" style={{ flex: 1 }} testID="delivery-time-input" />
            </View>

            <Text style={styles.formLabel}>Customer</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {customers.map((c) => (
                <Chip key={c.id} label={c.name} active={customerId === c.id} onPress={() => setCustomerId(c.id)} testID={`customer-chip-${c.id}`} />
              ))}
              {customers.length === 0 ? <Muted>Add customers from Settings → Customer Database</Muted> : null}
            </ScrollView>

            <Text style={styles.formLabel}>Driver</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {drivers.map((d) => (
                <Chip key={d.id} label={d.name} active={driverId === d.id} onPress={() => setDriverId(d.id)} testID={`driver-chip-${d.id}`} />
              ))}
              {drivers.length === 0 ? <Muted>Add drivers from Settings → Driver Database</Muted> : null}
            </ScrollView>

            <View style={{ height: SPACING.md }} />
            <Field label="Product" value={product} onChangeText={setProduct} placeholder="Sev, Bhujia, Gathiya…" testID="delivery-product-input" />
            {defaultProducts.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: SPACING.sm }}>
                {defaultProducts.map((p) => (
                  <Chip key={p} label={p} active={product === p} onPress={() => setProduct(p)} testID={`product-chip-${p}`} />
                ))}
              </ScrollView>
            ) : null}

            <View style={{ flexDirection: 'row', gap: SPACING.md }}>
              <Field label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="numeric" placeholder="0" style={{ flex: 1 }} testID="delivery-quantity-input" />
              <View style={{ flex: 1 }}>
                <Text style={styles.formLabel}>Unit</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {unitOptions.map((u) => (
                    <Chip key={u} label={u} active={unit === u} onPress={() => setUnit(u)} testID={`unit-chip-${u}`} />
                  ))}
                </ScrollView>
              </View>
            </View>

            <Field label="Remarks" value={remarks} onChangeText={setRemarks} placeholder="Optional notes" testID="delivery-remarks-input" />

            <View style={{ flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.md }}>
              <Btn title="Cancel" onPress={onClose} variant="ghost" style={{ flex: 1 }} testID="delivery-cancel-button" />
              <Btn title="Save Delivery" onPress={save} loading={saving} style={{ flex: 1 }} testID="delivery-save-button" />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.surface },
  header: { padding: SPACING.lg, paddingBottom: SPACING.sm },
  searchRow: { paddingHorizontal: SPACING.lg },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: SPACING.md, backgroundColor: COLORS.surfaceTertiary, borderRadius: RADIUS.md },
  chipsRow: { gap: 8, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  empty: { alignItems: 'center', padding: 48, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.onSurface, marginTop: SPACING.md },
  deliveryCard: { padding: SPACING.md },
  deliveryHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  deliveryIcon: { width: 40, height: 40, borderRadius: RADIUS.md, backgroundColor: COLORS.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  dCustomer: { fontSize: 15, fontWeight: '700', color: COLORS.onSurface },
  dDriver: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  qtyBadge: { backgroundColor: COLORS.brandPrimary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.pill },
  qtyText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  dBody: { marginTop: SPACING.sm, paddingLeft: 52 },
  product: { fontSize: 14, color: COLORS.onSurfaceSecondary, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8, marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.divider },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: RADIUS.md },
  actionText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  fab: {
    position: 'absolute', bottom: 80, right: SPACING.lg,
    width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.brandPrimary,
    alignItems: 'center', justifyContent: 'center', ...SHADOW,
  },
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, padding: SPACING.lg, maxHeight: '90%' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.borderStrong, alignSelf: 'center', marginBottom: SPACING.md },
  formLabel: { fontSize: 12, fontWeight: '600', color: COLORS.onSurfaceSecondary, marginBottom: 6, marginTop: SPACING.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
});
