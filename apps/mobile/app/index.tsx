import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { Button } from '../src/components/Button';
import { Screen } from '../src/components/Screen';
import { TaskListScreen } from '../src/features/tasks/TaskListScreen';
import { useTheme } from '../src/theme/theme';

export default function Home() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { state, signOut } = useAuth();
  const user = state.status === 'ready' ? state.user : null;
  if (user?.role === 'collaborator') return <TaskListScreen />;

  // Placeholder until the client view (M-30) exists.
  return (
    <Screen>
      <Text
        accessibilityRole="header"
        style={{ color: colors.text, fontSize: 24, fontWeight: '600' }}
      >
        {t('app.clientHome')}
      </Text>
      <Text style={{ color: colors.textSecondary }}>{user?.name}</Text>
      <Button variant="outline" label={t('common.logout')} onPress={() => void signOut()} />
    </Screen>
  );
}
