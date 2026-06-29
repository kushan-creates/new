import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../theme/theme';

type Variant = 'success' | 'error' | 'info';
type ToastCtx = { show: (msg: string, variant?: Variant) => void };
const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; variant: Variant } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  const show = useCallback((text: string, variant: Variant = 'info') => {
    setMsg({ text, variant });
  }, []);

  useEffect(() => {
    if (!msg) return;
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    const t = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setMsg(null));
    }, 2400);
    return () => clearTimeout(t);
  }, [msg, opacity]);

  const bg = msg?.variant === 'success' ? COLORS.success : msg?.variant === 'error' ? COLORS.error : COLORS.brandPrimary;

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {msg ? (
        <Animated.View pointerEvents="none" style={[styles.wrap, { opacity }]}>
          <View style={[styles.toast, { backgroundColor: bg }]} testID="toast">
            <Text style={styles.text}>{msg.text}</Text>
          </View>
        </Animated.View>
      ) : null}
    </Ctx.Provider>
  );
}

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error('ToastProvider missing');
  return c;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 70, left: 0, right: 0, alignItems: 'center', zIndex: 9999 },
  toast: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderRadius: RADIUS.md, maxWidth: '90%' },
  text: { color: '#fff', fontWeight: '600', fontSize: 14, textAlign: 'center' },
});
