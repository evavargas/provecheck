import {
  formatTime,
  formatDayMonth,
  type CollaboratorTaskDto,
  type Locale,
  type TaskStatus,
} from '@provecheck/shared';
import { useRouter } from 'expo-router';
import { CircleAlert, LogOut, MapPin, RefreshCw } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { setLocale } from '../../i18n';
import { PreferenceBar } from '../../components/PreferenceBar';
import { useTheme } from '../../theme/theme';
import { errorText, sameDay } from './helpers';

export function StatusPill({ status }: { status: TaskStatus }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  // Amber only as a background with dark text (design system).
  const tone =
    status === 'on_site' || status === 'in_review'
      ? { bg: colors.warning, fg: colors.onWarning }
      : status === 'completed' || status === 'resolved'
        ? { bg: colors.success, fg: '#FFFFFF' }
        : status === 'objection_filed'
          ? { bg: colors.error, fg: '#FFFFFF' }
          : status === 'cancelled'
            ? { bg: colors.border, fg: colors.text }
            : { bg: colors.primaryContainer, fg: colors.primary };
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text style={{ color: tone.fg, fontSize: 12, fontWeight: '700' }}>
        {t(`taskStatus.${status}`)}
      </Text>
    </View>
  );
}

export function TaskListScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { signOut } = useAuth();
  const router = useRouter();
  const [tasks, setTasks] = useState<CollaboratorTaskDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // shortcut: plain fetch on focus, no cache or offline copy; add the local store when offline support lands.
  const load = useCallback(async () => {
    setError(null);
    try {
      setTasks((await api.myTasks.list()).items);
    } catch (err) {
      setError(errorText(t, err));
    }
  }, [t]);
  useEffect(() => void load(), [load]);

  const now = new Date();
  const today =
    tasks?.filter((k) => sameDay(k.scheduledStartAt, now) || k.status === 'on_site') ?? [];
  const upcoming = tasks?.filter((k) => !today.includes(k)) ?? [];

  const card = (k: CollaboratorTaskDto) => (
    <Pressable
      key={k.id}
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/task/[id]', params: { id: k.id } })}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={styles.row}>
        <Text style={[styles.time, { color: colors.text }]}>
          {formatDayMonth(k.scheduledStartAt, i18n.language)}
          {' · '}
          {formatTime(k.scheduledStartAt, i18n.language)}
        </Text>
        <StatusPill status={k.status} />
      </View>
      <Text style={{ color: colors.text, fontWeight: '600' }}>
        {k.clientCompanyName ?? k.serviceTypeName ?? k.address}
      </Text>
      <View style={styles.row}>
        <MapPin size={16} color={colors.textSecondary} />
        <Text style={{ color: colors.textSecondary, flex: 1 }}>{k.address}</Text>
      </View>
    </Pressable>
  );

  const section = (title: string, items: CollaboratorTaskDto[]) =>
    items.length > 0 && (
      <View style={{ gap: 10 }}>
        <Text accessibilityRole="header" style={[styles.section, { color: colors.textSecondary }]}>
          {title}
        </Text>
        {items.map(card)}
      </View>
    );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.row}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            {t('collab.title')}
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
              <Text style={{ color: colors.primary, fontWeight: '600' }}>{t('collab.retry')}</Text>
            </Pressable>
          </View>
        )}
        {tasks?.length === 0 && (
          <Text style={{ color: colors.textSecondary }}>{t('collab.empty')}</Text>
        )}
        {section(t('collab.today'), today)}
        {section(t('collab.upcoming'), upcoming)}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 18, width: '100%', maxWidth: 560, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'space-between' },
  title: { fontSize: 24, fontWeight: '600', flex: 1 },
  section: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  time: { fontSize: 16, fontWeight: '700' },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
});
