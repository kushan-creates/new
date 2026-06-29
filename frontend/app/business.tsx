import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';
import { api } from '@/src/api/client';
import { Btn, Card, Field, H2, Muted } from '@/src/components/UI';
import { useToast } from '@/src/components/Toast';
import { COLORS, SPACING } from '@/src/theme/theme';

export default function BusinessScreen() {
  const toast = useToast();
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('kg');
  const [products, setProducts] = useState('');

  const load = async () => {
    try {
      const s: any = await api('/settings');
      setName(s.business_name || ''); setUnit(s.default_unit || 'kg');
      setProducts((s.default_products || []).join(', '));
    } catch {}
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const save = async () => {
    try {
      await api('/settings', { method: 'PUT', body: JSON.stringify({
        business_name: name, default_unit: unit,
        default_products: products.split(',').map((p) => p.trim()).filter(Boolean),
      }) });
      toast.show('Settings saved', 'success');
    } catch (e: any) { toast.show(e.message, 'error'); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ title: 'Business Settings', headerShown: true, headerStyle: { backgroundColor: COLORS.surface } as any, headerTintColor: COLORS.onSurface }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.lg }}>
          <Card>
            <H2>Business Info</H2>
            <Muted>Shown across reports and headers</Muted>
            <View style={{ height: SPACING.md }} />
            <Field label="Business Name" value={name} onChangeText={setName} testID="business-name-input" />
            <Field label="Default Unit" value={unit} onChangeText={setUnit} placeholder="kg / g / packets" testID="business-unit-input" />
            <Field label="Default Products (comma separated)" value={products} onChangeText={setProducts} placeholder="Sev, Bhujia, Gathiya" multiline testID="business-products-input" />
            <Btn title="Save Settings" onPress={save} testID="business-save-button" />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: COLORS.surface } });
