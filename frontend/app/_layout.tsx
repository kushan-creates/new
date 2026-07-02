import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { LogBox, Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useIconFonts } from '@/src/hooks/use-icon-fonts';
import { AuthProvider } from '@/src/auth/AuthContext';
import { ToastProvider } from '@/src/components/Toast';

LogBox.ignoreAllLogs(true);

SplashScreen.preventAutoHideAsync();

// Ensure the browser tab title reflects the business name
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.title = 'Kushan.Ji Namkeen — Delivery Management';
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  const stack = (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <ToastProvider>
            {Platform.OS === 'web' ? (
              <View style={webStyles.page}>
                <View style={webStyles.phone}>{stack}</View>
              </View>
            ) : (
              stack
            )}
          </ToastProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const webStyles = StyleSheet.create({
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'stretch',
    backgroundColor: '#0F1224',
  },
  phone: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#F8F9FB',
    // subtle shadow to look like a device on desktop
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
});
