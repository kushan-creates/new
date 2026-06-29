import React, { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { api } from '@/src/api/client';
import { Btn, Card, Chip, Field, H1, H2, Muted } from '@/src/components/UI';
import { useToast } from '@/src/components/Toast';
import { COLORS, RADIUS, SPACING } from '@/src/theme/theme';

type Customer = { id: string; name: string; mobile: string; whatsapp: string };
type Driver = { id: string; name: string };

type ReportRow = {
  id: string; date: string; time: string;
  customer_name: string; customer_whatsapp: string; customer_mobile: string;
  driver_name: string; product: string; quantity: number; unit: string;
};

type ReportType = 'customer' | 'driver' | 'product' | 'all';

export default function ReportsScreen() {
  const toast = useToast();
  const [type, setType] = useState<ReportType>('customer');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedCust, setSelectedCust] = useState<string>('');
  const [selectedDriver, setSelectedDriver] = useState<string>('');
  const [fromDate, setFromDate] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [productRows, setProductRows] = useState<{ product: string; quantity: number; count: number; unit: string }[]>([]);
  const [totalQty, setTotalQty] = useState(0);
  const [loading, setLoading] = useState(false);

  useFocusEffect(useCallback(() => {
    (async () => {
      const [c, d] = await Promise.all([api<Customer[]>('/customers'), api<Driver[]>('/drivers')]);
      setCustomers(c); setDrivers(d);
      if (c[0]) setSelectedCust(c[0].id);
      if (d[0]) setSelectedDriver(d[0].id);
    })();
  }, []));

  const generate = async () => {
    setLoading(true);
    try {
      if (type === 'customer') {
        const r: any = await api(`/reports/customer-summary?customer_id=${selectedCust}&date_from=${fromDate}&date_to=${toDate}`);
        setRows(r.rows); setTotalQty(r.total_quantity); setProductRows([]);
      } else if (type === 'driver') {
        const r: any = await api(`/reports/driver-summary?driver_id=${selectedDriver}&date_from=${fromDate}&date_to=${toDate}`);
        setRows(r.rows); setTotalQty(r.total_quantity); setProductRows([]);
      } else if (type === 'product') {
        const r: any = await api(`/reports/product-summary?date_from=${fromDate}&date_to=${toDate}`);
        setProductRows(r.rows); setRows([]); setTotalQty(r.rows.reduce((s: number, x: any) => s + x.quantity, 0));
      } else {
        const r: any = await api(`/reports/customer-summary?date_from=${fromDate}&date_to=${toDate}`);
        setRows(r.rows); setTotalQty(r.total_quantity); setProductRows([]);
      }
      toast.show('Report generated', 'success');
    } catch (e: any) {
      toast.show(e.message, 'error');
    } finally { setLoading(false); }
  };

  const buildHtml = () => {
    const title = type === 'customer' ? `Customer Summary` : type === 'driver' ? 'Driver Summary' : type === 'product' ? 'Product Summary' : 'All Deliveries';
    const customerName = customers.find((c) => c.id === selectedCust)?.name || '';
    const driverName = drivers.find((d) => d.id === selectedDriver)?.name || '';
    let body = '';
    if (productRows.length) {
      body = `<table><tr><th>Product</th><th>Quantity</th><th>Entries</th></tr>${
        productRows.map((p) => `<tr><td>${p.product}</td><td>${p.quantity.toFixed(2)} ${p.unit}</td><td>${p.count}</td></tr>`).join('')
      }</table>`;
    } else {
      body = `<table><tr><th>Date</th><th>Time</th><th>Customer</th><th>Driver</th><th>Product</th><th>Quantity</th></tr>${
        rows.map((r) => `<tr><td>${r.date}</td><td>${r.time}</td><td>${r.customer_name}</td><td>${r.driver_name}</td><td>${r.product}</td><td>${r.quantity} ${r.unit}</td></tr>`).join('')
      }</table>`;
    }
    return `<html><head><style>
      body{font-family:-apple-system,sans-serif;padding:24px;color:#111}
      h1{color:#2E3F9C;margin:0 0 4px}
      .meta{color:#666;font-size:13px;margin-bottom:24px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th{background:#2E3F9C;color:#fff;padding:10px;text-align:left}
      td{padding:8px;border-bottom:1px solid #eee}
      .total{margin-top:24px;font-size:16px;font-weight:700;color:#2E3F9C}
    </style></head><body>
      <h1>Kushan.Ji — ${title}</h1>
      <div class="meta">${customerName ? 'Customer: ' + customerName + '<br/>' : ''}${driverName && type === 'driver' ? 'Driver: ' + driverName + '<br/>' : ''}Period: ${fromDate} → ${toDate}</div>
      ${body}
      <div class="total">Total Quantity: ${totalQty.toFixed(2)}</div>
    </body></html>`;
  };

  const exportPdf = async () => {
    try {
      const { uri } = await Print.printToFileAsync({ html: buildHtml() });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
      else toast.show('PDF generated: ' + uri, 'success');
    } catch (e: any) {
      toast.show(e.message || 'PDF failed', 'error');
    }
  };

  const shareWhatsApp = async () => {
    if (type !== 'customer' || !rows.length) {
      toast.show('Generate a customer report first', 'info');
      return;
    }
    const cust = customers.find((c) => c.id === selectedCust);
    if (!cust) return;
    const phone = (cust.whatsapp || cust.mobile || '').replace(/\D/g, '');
    if (!phone) { toast.show('No WhatsApp number for customer', 'error'); return; }
    let msg = `*Kushan.Ji Delivery Report*\n\nCustomer: ${cust.name}\nPeriod: ${fromDate} → ${toDate}\n\n`;
    rows.forEach((r) => { msg += `${r.date} ${r.time}\n${r.product} — ${r.quantity} ${r.unit} (${r.driver_name})\n\n`; });
    msg += `*Total: ${totalQty.toFixed(2)}*`;
    const url = `https://wa.me/${phone.length > 10 ? phone : '91' + phone}?text=${encodeURIComponent(msg)}`;
    Linking.openURL(url);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}><H1>Reports</H1><Muted>Generate, export & share</Muted></View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 120 }}>
        <Card style={{ marginBottom: SPACING.lg }}>
          <H2 style={{ marginBottom: SPACING.md }}>Report Type</H2>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Chip label="Customer" active={type === 'customer'} onPress={() => setType('customer')} testID="report-type-customer" />
            <Chip label="Driver" active={type === 'driver'} onPress={() => setType('driver')} testID="report-type-driver" />
            <Chip label="Product" active={type === 'product'} onPress={() => setType('product')} testID="report-type-product" />
            <Chip label="All Date-wise" active={type === 'all'} onPress={() => setType('all')} testID="report-type-all" />
          </ScrollView>

          {type === 'customer' ? (
            <>
              <Text style={styles.formLabel}>Customer</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {customers.map((c) => <Chip key={c.id} label={c.name} active={selectedCust === c.id} onPress={() => setSelectedCust(c.id)} />)}
              </ScrollView>
            </>
          ) : null}
          {type === 'driver' ? (
            <>
              <Text style={styles.formLabel}>Driver</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {drivers.map((d) => <Chip key={d.id} label={d.name} active={selectedDriver === d.id} onPress={() => setSelectedDriver(d.id)} />)}
              </ScrollView>
            </>
          ) : null}

          <View style={{ flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.md }}>
            <Field label="From" value={fromDate} onChangeText={setFromDate} style={{ flex: 1 }} testID="report-from-date" />
            <Field label="To" value={toDate} onChangeText={setToDate} style={{ flex: 1 }} testID="report-to-date" />
          </View>

          <Btn title="Generate Report" onPress={generate} loading={loading} testID="report-generate-button" />
        </Card>

        {(rows.length > 0 || productRows.length > 0) ? (
          <Card>
            <H2>Result · {rows.length || productRows.length} entries</H2>
            <Text style={styles.total}>Total: {totalQty.toFixed(2)}</Text>
            <View style={{ marginTop: SPACING.md }}>
              {productRows.length ? productRows.map((p, i) => (
                <View key={i} style={styles.resultRow}>
                  <Text style={styles.rowName}>{p.product}</Text>
                  <Text style={styles.rowQty}>{p.quantity.toFixed(2)} {p.unit} · {p.count}×</Text>
                </View>
              )) : rows.slice(0, 50).map((r) => (
                <View key={r.id} style={styles.resultRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{r.product} · {r.customer_name}</Text>
                    <Muted>{r.date} {r.time} · {r.driver_name}</Muted>
                  </View>
                  <Text style={styles.rowQty}>{r.quantity} {r.unit}</Text>
                </View>
              ))}
              {rows.length > 50 ? <Muted style={{ marginTop: 8 }}>Showing first 50 — PDF has all</Muted> : null}
            </View>

            <View style={{ flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.lg }}>
              <Btn title="Export PDF" onPress={exportPdf} variant="secondary" style={{ flex: 1 }} icon={<Ionicons name="document-text" size={16} color={COLORS.brandPrimary} />} testID="report-pdf-button" />
              <Btn title="WhatsApp" onPress={shareWhatsApp} variant="success" style={{ flex: 1 }} icon={<Ionicons name="logo-whatsapp" size={16} color="#fff" />} testID="report-whatsapp-button" />
            </View>
          </Card>
        ) : (
          <Card>
            <View style={{ alignItems: 'center', padding: SPACING.xl }}>
              <Ionicons name="bar-chart-outline" size={48} color={COLORS.muted} />
              <Text style={{ marginTop: SPACING.md, fontWeight: '700', color: COLORS.onSurface }}>No report generated</Text>
              <Muted>Pick filters and tap Generate</Muted>
            </View>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.surface },
  header: { padding: SPACING.lg, paddingBottom: SPACING.sm },
  formLabel: { fontSize: 12, fontWeight: '700', color: COLORS.onSurfaceSecondary, marginTop: SPACING.md, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  total: { fontSize: 18, fontWeight: '800', color: COLORS.brandPrimary, marginTop: 4 },
  resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.divider, gap: SPACING.md },
  rowName: { fontSize: 14, fontWeight: '600', color: COLORS.onSurface },
  rowQty: { fontSize: 14, fontWeight: '700', color: COLORS.brandPrimary },
});
