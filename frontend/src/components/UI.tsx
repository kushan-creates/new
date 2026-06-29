import React from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View, StyleSheet, ViewStyle, TextStyle, TextInputProps } from 'react-native';
import { COLORS, RADIUS, SHADOW, SPACING } from '../theme/theme';

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Btn({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  testID,
  style,
  icon,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  style?: ViewStyle;
  icon?: React.ReactNode;
}) {
  const bg =
    variant === 'primary' ? COLORS.brandPrimary
      : variant === 'secondary' ? COLORS.brandTertiary
      : variant === 'success' ? COLORS.whatsapp
      : variant === 'danger' ? COLORS.error
      : 'transparent';
  const fg =
    variant === 'secondary' ? COLORS.brandPrimary
      : variant === 'ghost' ? COLORS.brandPrimary
      : '#fff';
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: pressed || disabled ? 0.75 : 1 },
        variant === 'ghost' && { borderWidth: 1, borderColor: COLORS.border },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon}
          <Text style={[styles.btnText, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  testID,
  style,
  ...rest
}: TextInputProps & { label?: string; style?: ViewStyle }) {
  return (
    <View style={[{ marginBottom: SPACING.md }, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={COLORS.muted}
        testID={testID}
        style={styles.input}
        {...rest}
      />
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[styles.chip, active && { backgroundColor: COLORS.brandPrimary, borderColor: COLORS.brandPrimary }]}
    >
      <Text style={[styles.chipText, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export function H1({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[styles.h1, style]}>{children}</Text>;
}
export function H2({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[styles.h2, style]}>{children}</Text>;
}
export function Body({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}
export function Muted({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOW,
  },
  btn: {
    paddingVertical: 14,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  btnText: { fontSize: 15, fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '600', color: COLORS.onSurfaceSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: COLORS.surfaceTertiary,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.onSurface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceSecondary,
    flexShrink: 0,
  },
  chipText: { fontSize: 13, fontWeight: '600', color: COLORS.onSurfaceSecondary },
  h1: { fontSize: 26, fontWeight: '800', color: COLORS.onSurface, letterSpacing: -0.5 },
  h2: { fontSize: 18, fontWeight: '700', color: COLORS.onSurface },
  body: { fontSize: 14, color: COLORS.onSurfaceSecondary },
  muted: { fontSize: 12, color: COLORS.muted },
});
