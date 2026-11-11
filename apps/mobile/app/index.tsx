import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { Button } from '../src/components/Button';
import { Screen } from '../src/components/Screen';
import { useTheme } from '../src/theme/theme';

// Placeholder until M-10 (collaborator) and M-30 (client) exist.
export default function Home() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { state, signOut } = useAuth();
  const user = state.status === 'ready' ? state.user : null;
  return (
    <Screen>
      <Text
        accessibilityRole="header"
        style={{ color: colors.text, fontSize: 24, fontWeight: '600' }}
      >
        {t(user?.role === 'client_user' ? 'app.clientHome' : 'app.collaboratorHome')}
      </Text>
      <Text style={{ color: colors.textSecondary }}>{user?.name}</Text>
      <Button variant="outline" label={t('common.logout')} onPress={() => void signOut()} />
    </Screen>
  );
}
