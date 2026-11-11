import { formatDateTime, formatTime, type CollaboratorTaskDto } from '@provecheck/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, CircleAlert, MapPin } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../src/api/client';
import { Button } from '../../src/components/Button';
import { StatusPill } from '../../src/features/tasks/TaskListScreen';
import { errorText } from '../../src/features/tasks/helpers';
import { useTheme } from '../../src/theme/theme';

export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const [task, setTask] = useState<CollaboratorTaskDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setTask(await api.myTasks.get(id));
    } catch (err) {
      setError(errorText(t, err));
    }
  }, [id, t]);
  useEffect(() => void load(), [load]);

  async function arrive(delayed: boolean) {
    setBusy(true);
    setError(null);
    try {
      setTask(
        await api.myTasks.arrival(id, {
          deviceArrivedAt: new Date().toISOString(),
          attendanceDelayed: delayed,
        }),
      );
      setAsking(false);
    } catch (err) {
      // Cancelled or reassigned meanwhile (F6.4): tell them and go back to the list.
      setError(errorText(t, err));
      setAsking(false);
      void load();
    } finally {
      setBusy(false);
    }
  }

  const back = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('common.close')}
      onPress={() => router.back()}
      hitSlop={10}
    >
      <ArrowLeft size={24} color={colors.text} />
    </Pressable>
  );
  const row = (label: string, value: string | null) =>
    value ? (
      <View style={{ gap: 2 }}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={{ color: colors.text, fontSize: 16 }}>{value}</Text>
      </View>
    ) : null;

  const maps = (address: string) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.content}>
        {back}
        {!task && !error && <ActivityIndicator color={colors.primary} />}
        {error && (
          <View style={styles.inline} accessibilityLiveRegion="polite">
            <CircleAlert size={16} color={colors.error} />
            <Text style={{ color: colors.error, flex: 1 }}>{error}</Text>
          </View>
        )}
        {task && (
          <>
            <View style={styles.inline}>
              <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
                {formatDateTime(task.scheduledStartAt, i18n.language)}
              </Text>
              <StatusPill status={task.status} />
            </View>
            {row(t('collab.detail.service'), task.serviceTypeName)}
            {row(t('collab.detail.description'), task.description)}
            {row(t('collab.detail.instructions'), task.instructions)}
            {row(t('collab.detail.recipient'), task.recipientName)}
            <View
              style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={styles.inline}>
                <MapPin size={18} color={colors.textSecondary} />
                <Text style={{ color: colors.text, flex: 1 }}>{task.address}</Text>
              </View>
              <Button
                variant="outline"
                label={t('collab.detail.howToGet')}
                onPress={() => void Linking.openURL(maps(task.address))}
              />
              {task.clientCompanyPhone && (
                <Button
                  variant="outline"
                  label={`${t('collab.detail.call')} ${task.clientCompanyPhone}`}
                  onPress={() => void Linking.openURL(`tel:${task.clientCompanyPhone}`)}
                />
              )}
            </View>
            {task.team.length > 1 && (
              <View style={{ gap: 4 }}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  {t('collab.detail.team')}
                </Text>
                {task.team
                  .filter((m) => m.active)
                  .map((m) => (
                    <Text key={m.collaboratorId} style={{ color: colors.text }}>
                      {m.name} ·{' '}
                      {m.arrivedAt
                        ? `${t('collab.detail.teamArrived')} ${formatTime(m.arrivedAt, i18n.language)}`
                        : t('collab.detail.teamPending')}
                    </Text>
                  ))}
              </View>
            )}

            {task.status === 'completed' && (
              <Text style={{ color: colors.textSecondary }}>{t('collab.detail.done')}</Text>
            )}
            {task.myArrivedAt && task.status !== 'completed' && (
              <Text style={{ color: colors.success, fontWeight: '600' }}>
                {t('collab.detail.arrivedAt', {
                  time: formatTime(task.myArrivedAt, i18n.language),
                })}
              </Text>
            )}
            {task.status === 'scheduled' && !task.myArrivedAt && !asking && (
              <Button label={t('collab.detail.arrive')} onPress={() => setAsking(true)} />
            )}
            {asking && (
              <View
                style={[
                  styles.box,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <Text
                  accessibilityRole="header"
                  style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}
                >
                  {t('collab.detail.delayQuestion')}
                </Text>
                <Button
                  label={t('collab.detail.yes')}
                  disabled={busy}
                  onPress={() => void arrive(true)}
                />
                <Button
                  variant="outline"
                  label={t('collab.detail.no')}
                  disabled={busy}
                  onPress={() => void arrive(false)}
                />
                <Button
                  variant="outline"
                  label={t('collab.detail.cancel')}
                  disabled={busy}
                  onPress={() => setAsking(false)}
                />
              </View>
            )}
            {task.status === 'on_site' && task.myArrivedAt && (
              <Button
                label={t('collab.detail.finish')}
                onPress={() => router.push({ pathname: '/task/finish/[id]', params: { id } })}
              />
            )}
            {task.status === 'on_site' && !task.myArrivedAt && !asking && (
              <Button label={t('collab.detail.arrive')} onPress={() => setAsking(true)} />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: '600', flex: 1 },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  box: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 12 },
});
