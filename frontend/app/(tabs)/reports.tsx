import React, { useCallback, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { api } from '@/src/api/client';
import { Btn, Card, Chip, Field, H1, H2, Muted } from '@/src/components/UI';
import { useToast } from '@/src/components/Toast';
import { COLORS, RADIUS, SPACING } from '@/src/theme/theme';
import { LOGO_BASE64 } from '@/src/assets/logo-base64';
import { exportPdfCrossPlatform, exportCsvCrossPlatform } from '@/src/utils/exporters';

type Customer = { id: string; name: string; mobile: string; whatsapp: string };
type Driver = { id: string; name: string };

type SimpleRow = {
  id: string; date: string; time: string;
  customer_name: string; customer_whatsapp: string; customer_mobile: string;
  driver_name: string; product: string; quantity: number; unit: string;
};

type PeriodAnalysis = {
  period_label: string;
  from: string;
  to: string;
  grand_total_quantity: number;
  grand_total_count: number;
  by_day: { date: string; quantity: number; count: number }[];
  by_customer: {
    customer_id: string;
    name: string;
    quantity: number;
    count: number;
    days: { date: string; quantity: number }[];
  }[];
  by_product: { product: string; quantity: number; count: number }[];
};

type Mode = 'summary' | 'analysis';
type SumType = 'customer' | 'driver' | 'product' | 'all';
type Period = 'weekly' | 'monthly' | 'yearly' | 'custom';

export default function ReportsScreen() {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('analysis');

  // shared master data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);

  // summary state
  const [sumType, setSumType] = useState<SumType>('customer');
  const [selectedCust, setSelectedCust] = useState<string>('');
  const [selectedDriver, setSelectedDriver] = useState<string>('');
  const [fromDate, setFromDate] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<SimpleRow[]>([]);
  const [productRows, setProductRows] = useState<{ product: string; quantity: number; count: number; unit: string }[]>([]);
  const [totalQty, setTotalQty] = useState(0);

  // analysis state
  const [period, setPeriod] = useState<Period>('monthly');
  const [analysisCust, setAnalysisCust] = useState<string>(''); // '' = all customers
  const [analysis, setAnalysis] = useState<PeriodAnalysis | null>(null);

  const [loading, setLoading] = useState(false);

  useFocusEffect(useCallback(() => {
    (async () => {
      const [c, d] = await Promise.all([api<Customer[]>('/customers'), api<Driver[]>('/drivers')]);
      setCustomers(c); setDrivers(d);
      if (c[0]) setSelectedCust(c[0].id);
      if (d[0]) setSelectedDriver(d[0].id);
    })();
  }, []));

  const generateSummary = async () => {
    setLoading(true);
    try {
      if (sumType === 'customer') {
        const r: any = await api(`/reports/customer-summary?customer_id=${selectedCust}&date_from=${fromDate}&date_to=${toDate}`);
        setRows(r.rows); setTotalQty(r.total_quantity); setProductRows([]);
      } else if (sumType === 'driver') {
        const r: any = await api(`/reports/driver-summary?driver_id=${selectedDriver}&date_from=${fromDate}&date_to=${toDate}`);
        setRows(r.rows); setTotalQty(r.total_quantity); setProductRows([]);
      } else if (sumType === 'product') {
        const r: any = await api(`/reports/product-summary?date_from=${fromDate}&date_to=${toDate}`);
        setProductRows(r.rows); setRows([]); setTotalQty(r.rows.reduce((s: number, x: any) => s + x.quantity, 0));
      } else {
        const r: any = await api(`/reports/customer-summary?date_from=${fromDate}&date_to=${toDate}`);
        setRows(r.rows); setTotalQty(r.total_quantity); setProductRows([]);
      }
      toast.show('Report generated', 'success');
    } catch (e: any) { toast.show(e.message, 'error'); }
    finally { setLoading(false); }
  };

  const generateAnalysis = async () => {
    setLoading(true);
    try {
      let url = `/reports/period-analysis?period=${period}`;
      if (period === 'custom') url += `&date_from=${fromDate}&date_to=${toDate}`;
      if (analysisCust) url += `&customer_id=${analysisCust}`;
      const r = await api<PeriodAnalysis>(url);
      setAnalysis(r);
      toast.show('Analysis ready', 'success');
    } catch (e: any) { toast.show(e.message, 'error'); }
    finally { setLoading(false); }
  };

  const buildSummaryHtml = () => {
    const title = sumType === 'customer' ? `Customer Summary` : sumType === 'driver' ? 'Driver Summary' : sumType === 'product' ? 'Product Summary' : 'All Deliveries';
    const customerName = customers.find((c) => c.id === selectedCust)?.name || '';
    const driverName = drivers.find((d) => d.id === selectedDriver)?.name || '';
    let body = '';
    if (productRows.length) {
      body = `<table><tr><th>Product</th><th>Quantity</th><th>Entries</th></tr>${productRows.map((p) => `<tr><td>${p.product}</td><td>${p.quantity.toFixed(2)} ${p.unit}</td><td>${p.count}</td></tr>`).join('')}</table>`;
    } else {
      body = `<table><tr><th>Date</th><th>Time</th><th>Customer</th><th>Driver</th><th>Product</th><th>Quantity</th></tr>${rows.map((r) => `<tr><td>${r.date}</td><td>${r.time}</td><td>${r.customer_name}</td><td>${r.driver_name}</td><td>${r.product}</td><td>${r.quantity} ${r.unit}</td></tr>`).join('')}</table>`;
    }
    return wrapHtml(title, `${customerName ? 'Customer: ' + customerName + '<br/>' : ''}${driverName && sumType === 'driver' ? 'Driver: ' + driverName + '<br/>' : ''}Period: ${fromDate} → ${toDate}`, body, totalQty);
  };

  const buildAnalysisHtml = () => {
    if (!analysis) return '';
    const customerName = analysis.by_customer.length === 1 ? analysis.by_customer[0].name : (analysisCust ? customers.find((c) => c.id === analysisCust)?.name || '' : 'All Customers');
    let body = '';
    body += `<h2>Sales by Day</h2><table><tr><th>Date</th><th>Deliveries</th><th>Quantity</th></tr>${analysis.by_day.map((d) => `<tr><td>${d.date}</td><td>${d.count}</td><td>${d.quantity.toFixed(2)}</td></tr>`).join('')}</table>`;
    body += `<h2>By Customer</h2><table><tr><th>Customer</th><th>Deliveries</th><th>Quantity</th></tr>${analysis.by_customer.map((c) => `<tr><td>${c.name}</td><td>${c.count}</td><td>${c.quantity.toFixed(2)}</td></tr>`).join('')}</table>`;
    if (analysis.by_customer.length && analysis.by_customer[0].days.length) {
      body += `<h2>Per-Day Breakdown</h2>`;
      analysis.by_customer.forEach((c) => {
        body += `<h3 style="color:#2E3F9C;margin-top:16px;">${c.name} · Total: ${c.quantity.toFixed(2)}</h3><table>${c.days.map((d) => `<tr><td>${d.date}</td><td>${d.quantity.toFixed(2)}</td></tr>`).join('')}</table>`;
      });
    }
    body += `<h2>By Product</h2><table><tr><th>Product</th><th>Deliveries</th><th>Quantity</th></tr>${analysis.by_product.map((p) => `<tr><td>${p.product}</td><td>${p.count}</td><td>${p.quantity.toFixed(2)}</td></tr>`).join('')}</table>`;
    return wrapHtml(`${period.charAt(0).toUpperCase() + period.slice(1)} Analysis`, `Customer: ${customerName}<br/>Period: ${analysis.period_label} (${analysis.from} → ${analysis.to})`, body, analysis.grand_total_quantity);
  };

  const exportPdf = async () => {
    try {
      const html = mode === 'summary' ? buildSummaryHtml() : buildAnalysisHtml();
      if (!html) { toast.show('Generate a report first', 'info'); return; }
      await exportPdfCrossPlatform(html, `kushanji-${mode}`);
    } catch (e: any) { toast.show(e.message || 'PDF failed', 'error'); }
  };

  const exportCsv = async () => {
    try {
      let csv = '';
      if (mode === 'summary') {
        if (productRows.length) {
          csv = 'Product,Quantity,Entries\n' + productRows.map((p) => `"${p.product}",${p.quantity},${p.count}`).join('\n');
        } else {
          csv = 'Date,Time,Customer,Driver,Product,Quantity,Unit\n' + rows.map((r) => `${r.date},${r.time},"${r.customer_name}","${r.driver_name}","${r.product}",${r.quantity},${r.unit}`).join('\n');
        }
      } else if (analysis) {
        csv = 'Date,Deliveries,Quantity\n' + analysis.by_day.map((d) => `${d.date},${d.count},${d.quantity}`).join('\n');
        csv += '\n\nCustomer,Deliveries,Quantity\n' + analysis.by_customer.map((c) => `"${c.name}",${c.count},${c.quantity}`).join('\n');
        csv += '\n\nProduct,Deliveries,Quantity\n' + analysis.by_product.map((p) => `"${p.product}",${p.count},${p.quantity}`).join('\n');
      }
      if (!csv) { toast.show('Generate a report first', 'info'); return; }
      await exportCsvCrossPlatform(csv, `kushanji-${mode}`);
    } catch (e: any) { toast.show(e.message, 'error'); }
  };

  const shareWhatsApp = async () => {
    if (mode === 'summary') {
      if (sumType !== 'customer' || !rows.length) { toast.show('Generate a customer report first', 'info'); return; }
      const cust = customers.find((c) => c.id === selectedCust); if (!cust) return;
      const phone = (cust.whatsapp || cust.mobile || '').replace(/\D/g, '');
      if (!phone) { toast.show('No WhatsApp number for customer', 'error'); return; }
      let msg = `*Kushan.Ji Delivery Report*\n\nCustomer: ${cust.name}\nPeriod: ${fromDate} → ${toDate}\n\n`;
      rows.forEach((r) => { msg += `${r.date} ${r.time}\n${r.product} — ${r.quantity} ${r.unit} (${r.driver_name})\n\n`; });
      msg += `*Total: ${totalQty.toFixed(2)}*`;
      Linking.openURL(`https://wa.me/${phone.length > 10 ? phone : '91' + phone}?text=${encodeURIComponent(msg)}`);
    } else if (analysis) {
      if (!analysisCust) { toast.show('Pick a customer for WhatsApp share', 'info'); return; }
      const cust = customers.find((c) => c.id === analysisCust); if (!cust) return;
      const phone = (cust.whatsapp || cust.mobile || '').replace(/\D/g, '');
      if (!phone) { toast.show('No WhatsApp number for customer', 'error'); return; }
      const c = analysis.by_customer.find((x) => x.customer_id === analysisCust) || analysis.by_customer[0];
      let msg = `*Kushan.Ji ${period.toUpperCase()} Report*\n\nCustomer: ${cust.name}\nPeriod: ${analysis.period_label}\n\n`;
      c?.days.forEach((d) => { msg += `${d.date}: ${d.quantity.toFixed(2)}\n`; });
      msg += `\n*Total: ${(c?.quantity || 0).toFixed(2)}*\nDeliveries: ${c?.count || 0}`;
      Linking.openURL(`https://wa.me/${phone.length > 10 ? phone : '91' + phone}?text=${encodeURIComponent(msg)}`);
    }
  };

  const hasResult = mode === 'summary' ? (rows.length > 0 || productRows.length > 0) : analysis !== null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <H1>Reports & Analysis</H1>
        <Muted>Weekly · Monthly · Yearly insights</Muted>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 120 }}>
        <View style={styles.modeSwitch}>
          <Chip label="Sales Analysis" active={mode === 'analysis'} onPress={() => setMode('analysis')} testID="report-mode-analysis" />
          <Chip label="Simple Summary" active={mode === 'summary'} onPress={() => setMode('summary')} testID="report-mode-summary" />
        </View>

        {mode === 'analysis' ? (
          <Card style={{ marginBottom: SPACING.lg }}>
            <H2 style={{ marginBottom: SPACING.md }}>Period</H2>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Chip label="This Week" active={period === 'weekly'} onPress={() => setPeriod('weekly')} testID="period-weekly" />
              <Chip label="This Month" active={period === 'monthly'} onPress={() => setPeriod('monthly')} testID="period-monthly" />
              <Chip label="This Year" active={period === 'yearly'} onPress={() => setPeriod('yearly')} testID="period-yearly" />
              <Chip label="Custom" active={period === 'custom'} onPress={() => setPeriod('custom')} testID="period-custom" />
            </ScrollView>

            {period === 'custom' ? (
              <View style={{ flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.md }}>
                <Field label="From" value={fromDate} onChangeText={setFromDate} style={{ flex: 1 }} testID="analysis-from-date" />
                <Field label="To" value={toDate} onChangeText={setToDate} style={{ flex: 1 }} testID="analysis-to-date" />
              </View>
            ) : null}

            <Text style={styles.formLabel}>Customer (optional — leave empty for all)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              <Chip label="All Customers" active={analysisCust === ''} onPress={() => setAnalysisCust('')} testID="analysis-cust-all" />
              {customers.map((c) => <Chip key={c.id} label={c.name} active={analysisCust === c.id} onPress={() => setAnalysisCust(c.id)} testID={`analysis-cust-${c.id}`} />)}
            </ScrollView>

            <View style={{ height: SPACING.md }} />
            <Btn title="Generate Analysis" onPress={generateAnalysis} loading={loading} testID="analysis-generate-button" />
          </Card>
        ) : (
          <Card style={{ marginBottom: SPACING.lg }}>
            <H2 style={{ marginBottom: SPACING.md }}>Report Type</H2>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Chip label="Customer" active={sumType === 'customer'} onPress={() => setSumType('customer')} testID="report-type-customer" />
              <Chip label="Driver" active={sumType === 'driver'} onPress={() => setSumType('driver')} testID="report-type-driver" />
              <Chip label="Product" active={sumType === 'product'} onPress={() => setSumType('product')} testID="report-type-product" />
              <Chip label="All Date-wise" active={sumType === 'all'} onPress={() => setSumType('all')} testID="report-type-all" />
            </ScrollView>

            {sumType === 'customer' ? (
              <>
                <Text style={styles.formLabel}>Customer</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {customers.map((c) => <Chip key={c.id} label={c.name} active={selectedCust === c.id} onPress={() => setSelectedCust(c.id)} />)}
                </ScrollView>
              </>
            ) : null}
            {sumType === 'driver' ? (
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

            <Btn title="Generate Report" onPress={generateSummary} loading={loading} testID="report-generate-button" />
          </Card>
        )}

        {hasResult ? (
          <Card>
            {mode === 'analysis' && analysis ? <AnalysisView data={analysis} /> : <SummaryView rows={rows} productRows={productRows} totalQty={totalQty} />}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: SPACING.lg, flexWrap: 'wrap' }}>
              <Btn title="PDF" onPress={exportPdf} variant="secondary" style={{ flex: 1 }} icon={<Ionicons name="document-text" size={16} color={COLORS.brandPrimary} />} testID="report-pdf-button" />
              <Btn title="CSV" onPress={exportCsv} variant="ghost" style={{ flex: 1 }} icon={<Ionicons name="grid-outline" size={16} color={COLORS.brandPrimary} />} testID="report-csv-button" />
              <Btn title="WhatsApp" onPress={shareWhatsApp} variant="success" style={{ flex: 1 }} icon={<Ionicons name="logo-whatsapp" size={16} color="#fff" />} testID="report-whatsapp-button" />
            </View>
          </Card>
        ) : (
          <Card>
            <View style={{ alignItems: 'center', padding: SPACING.xl }}>
              <Ionicons name="bar-chart-outline" size={48} color={COLORS.muted} />
              <Text style={{ marginTop: SPACING.md, fontWeight: '700', color: COLORS.onSurface }}>Ready to generate</Text>
              <Muted>Choose your period and tap Generate</Muted>
            </View>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function AnalysisView({ data }: { data: PeriodAnalysis }) {
  const maxDay = Math.max(1, ...data.by_day.map((d) => d.quantity));
  return (
    <View>
      <Text style={styles.periodLabel}>{data.period_label}</Text>
      <Muted>{data.from} → {data.to}</Muted>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{data.grand_total_quantity.toFixed(1)}</Text>
          <Text style={styles.statLabel}>Total Quantity</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{data.grand_total_count}</Text>
          <Text style={styles.statLabel}>Deliveries</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{data.by_customer.length}</Text>
          <Text style={styles.statLabel}>Customers</Text>
        </View>
      </View>

      {data.by_day.length ? (
        <>
          <Text style={styles.sectionHeader}>Sales by Day</Text>
          <View style={styles.chart}>
            {data.by_day.slice(-14).map((d) => (
              <View key={d.date} style={styles.chartCol}>
                <View style={styles.barWrap}>
                  <View style={[styles.bar, { height: `${Math.max(4, (d.quantity / maxDay) * 100)}%` }]} />
                </View>
                <Text style={styles.chartValue}>{d.quantity.toFixed(0)}</Text>
                <Text style={styles.chartLabel}>{d.date.slice(5)}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <Text style={styles.sectionHeader}>Top Customers</Text>
      {data.by_customer.slice(0, 10).map((c) => (
        <View key={c.customer_id} style={styles.customerBlock}>
          <View style={styles.customerHead}>
            <Text style={styles.customerName}>{c.name}</Text>
            <Text style={styles.customerTotal}>{c.quantity.toFixed(2)}</Text>
          </View>
          <Muted>{c.count} {c.count === 1 ? 'delivery' : 'deliveries'} · {c.days.length} active {c.days.length === 1 ? 'day' : 'days'}</Muted>
          {c.days.length > 0 ? (
            <View style={styles.dayRows}>
              {c.days.map((d) => (
                <View key={d.date} style={styles.dayRow}>
                  <Text style={styles.dayDate}>{d.date}</Text>
                  <Text style={styles.dayQty}>{d.quantity.toFixed(2)}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ))}

      {data.by_product.length ? (
        <>
          <Text style={styles.sectionHeader}>Top Products</Text>
          {data.by_product.slice(0, 10).map((p) => (
            <View key={p.product} style={styles.productRow}>
              <Text style={styles.productName}>{p.product}</Text>
              <Text style={styles.productMeta}>{p.count} × · {p.quantity.toFixed(2)}</Text>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

function SummaryView({ rows, productRows, totalQty }: { rows: SimpleRow[]; productRows: { product: string; quantity: number; count: number; unit: string }[]; totalQty: number }) {
  return (
    <View>
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
    </View>
  );
}

function wrapHtml(title: string, meta: string, body: string, total: number): string {
  return `<html><head><style>
    body{font-family:-apple-system,sans-serif;padding:24px;color:#111}
    .header{display:flex;align-items:center;gap:16px;padding-bottom:16px;border-bottom:3px solid #2E3F9C;margin-bottom:20px}
    .logo-box{width:80px;height:80px;background:#000;border-radius:10px;display:flex;align-items:center;justify-content:center;padding:6px;flex-shrink:0}
    .logo-box img{max-width:100%;max-height:100%;object-fit:contain}
    .brand h1{color:#2E3F9C;margin:0;font-size:22px}
    .brand .tag{color:#666;font-size:13px;margin-top:2px}
    .report-title{color:#111;margin:0 0 4px;font-size:18px;font-weight:700}
    .meta{color:#666;font-size:13px;margin-bottom:20px}
    h2{color:#2E3F9C;margin:24px 0 8px;font-size:16px}
    h3{margin:12px 0 4px;font-size:14px}
    table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px}
    th{background:#2E3F9C;color:#fff;padding:10px;text-align:left}
    td{padding:8px;border-bottom:1px solid #eee}
    .total{margin-top:24px;font-size:18px;font-weight:700;color:#2E3F9C;padding-top:12px;border-top:2px solid #2E3F9C}
    .footer{margin-top:40px;padding-top:16px;border-top:1px dashed #ccc;font-size:11px;color:#666;text-align:center;line-height:1.6}
    .footer .brand-line{font-weight:700;color:#2E3F9C;font-size:13px}
    .footer a{color:#2E3F9C;text-decoration:none;font-weight:600}
  </style></head><body>
    <div class="header">
      <div class="logo-box"><img src="${LOGO_BASE64}" alt="Kushan.Ji" /></div>
      <div class="brand">
        <h1>Kushan.Ji Namkeen</h1>
        <div class="tag">Delivery Management System</div>
      </div>
    </div>
    <div class="report-title">${title}</div>
    <div class="meta">${meta}</div>
    ${body}
    <div class="total">Grand Total: ${total.toFixed(2)}</div>
    <div class="footer">
      <div class="brand-line">Created by Kushan.Ji Namkeen</div>
      <div>For any misunderstandings, please contact <a href="tel:+919909807047">+91 9909807047</a></div>
      <div>Generated on ${new Date().toLocaleString('en-IN')}</div>
    </div>
  </body></html>`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.surface },
  header: { padding: SPACING.lg, paddingBottom: SPACING.sm },
  modeSwitch: { flexDirection: 'row', gap: 8, marginBottom: SPACING.lg },
  formLabel: { fontSize: 12, fontWeight: '700', color: COLORS.onSurfaceSecondary, marginTop: SPACING.md, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  total: { fontSize: 18, fontWeight: '800', color: COLORS.brandPrimary, marginTop: 4 },
  resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.divider, gap: SPACING.md },
  rowName: { fontSize: 14, fontWeight: '600', color: COLORS.onSurface },
  rowQty: { fontSize: 14, fontWeight: '700', color: COLORS.brandPrimary },
  periodLabel: { fontSize: 20, fontWeight: '800', color: COLORS.onSurface },
  statsRow: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.lg },
  statBox: { flex: 1, backgroundColor: COLORS.brandTertiary, padding: SPACING.md, borderRadius: RADIUS.md, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '800', color: COLORS.brandPrimary },
  statLabel: { fontSize: 11, color: COLORS.onSurfaceSecondary, marginTop: 2, textAlign: 'center' },
  sectionHeader: { fontSize: 14, fontWeight: '800', color: COLORS.onSurface, marginTop: SPACING.lg, marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 4 },
  chartCol: { flex: 1, alignItems: 'center', minWidth: 24 },
  barWrap: { width: '100%', height: 90, justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '70%', backgroundColor: COLORS.brandPrimary, borderRadius: 4 },
  chartValue: { fontSize: 10, fontWeight: '700', color: COLORS.onSurface, marginTop: 2 },
  chartLabel: { fontSize: 9, color: COLORS.muted },
  customerBlock: { paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  customerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  customerName: { fontSize: 15, fontWeight: '700', color: COLORS.onSurface },
  customerTotal: { fontSize: 15, fontWeight: '800', color: COLORS.brandPrimary },
  dayRows: { marginTop: SPACING.sm, backgroundColor: COLORS.surfaceTertiary, borderRadius: RADIUS.sm, padding: SPACING.sm },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  dayDate: { fontSize: 12, color: COLORS.onSurfaceSecondary },
  dayQty: { fontSize: 12, fontWeight: '700', color: COLORS.onSurface },
  productRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  productName: { fontSize: 14, fontWeight: '600', color: COLORS.onSurface },
  productMeta: { fontSize: 13, fontWeight: '700', color: COLORS.brandPrimary },
});
