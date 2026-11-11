import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { Button } from '../src/components/Button';
import { Screen } from '../src/components/Screen';
import { ClientListScreen } from '../src/features/client/ClientListScreen';
import { TaskListScreen } from '../src/features/tasks/TaskListScreen';
import { useTheme } from '../src/theme/theme';

export default function Home() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { state, signOut } = useAuth();
  const user = state.status === 'ready' ? state.user : null;
  if (user?.role === 'collaborator') return <TaskListScreen />;
  if (user?.role === 'client_user') return <ClientListScreen />;

  // Admins use the panel; the app shows who is signed in and lets them leave.
  return (
    <Screen>
      <Text
        accessibilityRole="header"
        style={{ color: colors.text, fontSize: 24, fontWeight: '600' }}
      >
        {user?.name}
      </Text>
      <Button variant="outline" label={t('common.logout')} onPress={() => void signOut()} />
    </Screen>
  );
}
