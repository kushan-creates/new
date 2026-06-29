import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/auth/AuthContext';
import { COLORS } from '@/src/theme/theme';

export default function Index() {
  const { ready, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (user) router.replace('/(tabs)/dashboard');
    else router.replace('/login');
  }, [ready, user, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface }}>
      <ActivityIndicator color={COLORS.brandPrimary} size="large" />
    </View>
  );
}
