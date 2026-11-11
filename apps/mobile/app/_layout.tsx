import '../src/i18n';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/auth/AuthProvider';
import { FirstLoginScreen } from '../src/features/auth/FirstLoginScreen';
import { InactiveScreen } from '../src/features/auth/InactiveScreen';
import { LoginScreen } from '../src/features/auth/LoginScreen';
import { ThemeProvider, useTheme } from '../src/theme/theme';

// The auth flow is a gate, not navigation: nothing behind it is reachable (or deep-linkable) until the session is ready.
function Gate() {
  const { state } = useAuth();
  const { colors, isDark } = useTheme();
  useTranslation(); // re-render the screens when the language changes
  let content;
  switch (state.status) {
    case 'loading':
      content = (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.background,
          }}
        >
          <ActivityIndicator color={colors.primary} />
        </View>
      );
      break;
    case 'signedOut':
      content = <LoginScreen notice={state.notice} />;
      break;
    case 'inactive':
      content = <InactiveScreen />;
      break;
    case 'firstLogin':
      content = <FirstLoginScreen email={state.user.email} />;
      break;
    case 'ready':
      content = <Stack screenOptions={{ headerShown: false }} />;
  }
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {content}
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
