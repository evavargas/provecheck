import { formatDateTime, type ClientTaskDto, type Locale } from '@provecheck/shared';
import { useRouter } from 'expo-router';
import { CircleAlert, LogOut, MapPin, RefreshCw } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { PreferenceBar } from '../../components/PreferenceBar';
import { setLocale } from '../../i18n';
import { useTheme } from '../../theme/theme';
import { errorText } from '../tasks/helpers';
import { StatusPill } from '../tasks/TaskListScreen';

export function ClientListScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { signOut } = useAuth();
  const router = useRouter();
  const [tasks, setTasks] = useState<ClientTaskDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // shortcut: plain fetch, no cache; the client app needs a connection (M-32), so there is no offline copy.
  const load = useCallback(async () => {
    setError(null);
    try {
      setTasks((await api.myServices.list()).items);
    } catch (err) {
      setError(errorText(t, err));
    }
  }, [t]);
  useEffect(() => void load(), [load]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.row}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            {t('client.title')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('collab.refresh')}
            onPress={() => void load()}
            hitSlop={10}
          >
            <RefreshCw size={22} color={colors.primary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.logout')}
            onPress={() => void signOut()}
            hitSlop={10}
          >
            <LogOut size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
        <PreferenceBar locale={i18n.language as Locale} onLocale={(l) => void setLocale(l)} />
        {tasks === null && !error && <ActivityIndicator color={colors.primary} />}
        {error && (
          <View style={styles.row} accessibilityLiveRegion="polite">
            <CircleAlert size={16} color={colors.error} />
            <Text style={{ color: colors.error, flex: 1 }}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={() => void load()}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>{t('client.retry')}</Text>
            </Pressable>
          </View>
        )}
        {tasks?.length === 0 && (
          <Text style={{ color: colors.textSecondary }}>{t('client.empty')}</Text>
        )}
        {tasks?.map((k) => (
          <Pressable
            key={k.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/service/[id]', params: { id: k.id } })}
            style={[
              styles.card,
              { backgroundColor: colors.surface, borderColor: colors.border },
              k.status === 'cancelled' && { opacity: 0.7 },
            ]}
          >
            <View style={styles.row}>
              <Text style={[styles.time, { color: colors.text }]}>
                {formatDateTime(k.scheduledStartAt, i18n.language)}
              </Text>
              <StatusPill status={k.status} />
            </View>
            <Text style={{ color: colors.text, fontWeight: '600' }}>
              {k.serviceTypeName ?? k.clientCompanyName ?? k.address}
            </Text>
            <View style={styles.row}>
              <MapPin size={16} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, flex: 1 }}>{k.address}</Text>
            </View>
            {k.canRate && (
              <Text style={{ color: colors.primary, fontWeight: '700' }}>
                {t('client.canRate')}
              </Text>
            )}
            {k.canFileObjection || k.canRate
              ? k.objectionDeadlineAt && (
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                    {t('client.deadline', {
                      date: formatDateTime(k.objectionDeadlineAt, i18n.language),
                    })}
                  </Text>
                )
              : null}
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, width: '100%', maxWidth: 560, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'space-between' },
  title: { fontSize: 24, fontWeight: '600', flex: 1 },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  time: { fontSize: 16, fontWeight: '700', flex: 1 },
});
