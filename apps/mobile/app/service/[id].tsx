import {
  formatDateTime,
  formatTime,
  type ClientTaskDto,
  type ReportContent,
  type TaskReportDto,
} from '@provecheck/shared';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, CircleAlert } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
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
import { errorText } from '../../src/features/tasks/helpers';
import { StatusPill } from '../../src/features/tasks/TaskListScreen';
import { useTheme } from '../../src/theme/theme';

export function RecordText({ content }: { content: ReportContent }) {
  const { colors } = useTheme();
  const spans = (s: { text: string; bold?: boolean | undefined }[]) =>
    s.map((x, i) => (
      <Text key={i} style={x.bold ? { fontWeight: '700' } : undefined}>
        {x.text}
      </Text>
    ));
  return (
    <View style={{ gap: 8 }}>
      {content.blocks.map((b, i) =>
        b.type === 'paragraph' ? (
          <Text key={i} style={{ color: colors.text, fontSize: 16 }}>
            {spans(b.content)}
          </Text>
        ) : (
          <View key={i} style={{ gap: 4 }}>
            {b.items.map((item, j) => (
              <Text key={j} style={{ color: colors.text, fontSize: 16 }}>
                {'•  '}
                {spans(item)}
              </Text>
            ))}
          </View>
        ),
      )}
    </View>
  );
}

export default function ServiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const [task, setTask] = useState<ClientTaskDto | null>(null);
  const [report, setReport] = useState<TaskReportDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfNote, setPdfNote] = useState(false);

  const load = useCallback(async () => {
    try {
      const k = await api.myServices.get(id);
      setTask(k);
      if (k.completedAt) setReport(await api.myServices.report(id).catch(() => null));
    } catch (err) {
      setError(errorText(t, err));
    }
  }, [id, t]);
  // Reloads every time the screen is focused, so coming back from the objection or rating screens shows the result.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function openPdf() {
    setPdfNote(false);
    try {
      // shortcut: the PDF opens in the system viewer; an in-app viewer (M-34) can come later.
      await Linking.openURL((await api.myServices.pdf(id)).url);
    } catch {
      setPdfNote(true);
    }
  }

  const row = (label: string, value: string | null) =>
    value ? (
      <View style={{ gap: 2 }}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={{ color: colors.text, fontSize: 16 }}>{value}</Text>
      </View>
    ) : null;
  const section = (title: string) => (
    <Text
      accessibilityRole="header"
      style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}
    >
      {title}
    </Text>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={() => router.back()}
          hitSlop={10}
        >
          <ArrowLeft size={24} color={colors.text} />
        </Pressable>
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
            {task.status === 'cancelled' && (
              <Text style={{ color: colors.textSecondary }}>{t('client.detail.cancelled')}</Text>
            )}
            {row(t('client.detail.service'), task.serviceTypeName)}
            {row(t('client.detail.address'), task.address)}
            {row(t('client.detail.recipient'), task.recipientName)}
            {task.completedAt &&
              row(t('client.detail.completedAt'), formatDateTime(task.completedAt, i18n.language))}

            {task.team.length > 0 && (
              <View style={{ gap: 4 }}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  {t('client.detail.team')}
                </Text>
                {task.team.map((m) => (
                  <Text key={m.assignmentId} style={{ color: colors.text }}>
                    {m.name}
                    {m.arrivedAt
                      ? ` · ${t('client.detail.arrived', { time: formatTime(m.arrivedAt, i18n.language) })}`
                      : ''}
                    {m.attendanceDelayed ? ` · ${t('client.detail.delayed')}` : ''}
                    {m.myRating ? ` · ${'★'.repeat(m.myRating.stars)}` : ''}
                  </Text>
                ))}
              </View>
            )}

            {report && (
              <>
                {section(t('client.detail.record'))}
                <RecordText content={report.content} />
                {report.photos.length > 0 && (
                  <View style={styles.grid}>
                    {report.photos.map((p) =>
                      p.thumbUrl ? (
                        <Pressable
                          key={p.id}
                          accessibilityRole="imagebutton"
                          onPress={() => p.originalUrl && void Linking.openURL(p.originalUrl)}
                        >
                          <Image
                            source={{ uri: p.thumbUrl }}
                            style={styles.thumb}
                            accessibilityIgnoresInvertColors
                          />
                        </Pressable>
                      ) : (
                        <View
                          key={p.id}
                          style={[styles.thumb, styles.expired, { borderColor: colors.border }]}
                        >
                          <Text
                            style={{
                              color: colors.textSecondary,
                              fontSize: 11,
                              textAlign: 'center',
                            }}
                          >
                            {t('client.detail.photoExpired')}
                          </Text>
                        </View>
                      ),
                    )}
                  </View>
                )}
              </>
            )}
            {task.completedAt && (
              <>
                <Button
                  variant="outline"
                  label={t('client.detail.pdf')}
                  onPress={() => void openPdf()}
                />
                {pdfNote && (
                  <Text style={{ color: colors.textSecondary }}>
                    {t('client.detail.pdfPending')}
                  </Text>
                )}
              </>
            )}

            {task.objection && (
              <View
                style={[
                  styles.box,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                {section(t('client.detail.objection'))}
                <Text style={{ color: colors.textSecondary }}>
                  {t(`client.detail.objectionStatus.${task.objection.status}`)} ·{' '}
                  {formatDateTime(task.objection.createdAt, i18n.language)}
                </Text>
                <Text style={{ color: colors.text, fontSize: 16 }}>
                  {task.objection.description}
                </Text>
                {task.objection.attachments.length > 0 && (
                  <View style={styles.grid}>
                    {task.objection.attachments.map((a) =>
                      a.thumbUrl ? (
                        <Pressable
                          key={a.id}
                          accessibilityRole="imagebutton"
                          onPress={() => a.originalUrl && void Linking.openURL(a.originalUrl)}
                        >
                          <Image
                            source={{ uri: a.thumbUrl }}
                            style={styles.thumb}
                            accessibilityIgnoresInvertColors
                          />
                        </Pressable>
                      ) : (
                        <View
                          key={a.id}
                          style={[styles.thumb, styles.expired, { borderColor: colors.border }]}
                        >
                          <Text
                            style={{
                              color: colors.textSecondary,
                              fontSize: 11,
                              textAlign: 'center',
                            }}
                          >
                            {t('client.detail.imageExpired')}
                          </Text>
                        </View>
                      ),
                    )}
                  </View>
                )}
              </View>
            )}

            {task.canFileObjection && (
              <Button
                label={t('client.detail.fileObjection')}
                onPress={() => router.push({ pathname: '/service/objection/[id]', params: { id } })}
              />
            )}
            {task.canRate && (
              <Button
                variant="outline"
                label={t('client.detail.rate')}
                onPress={() => router.push({ pathname: '/service/rate/[id]', params: { id } })}
              />
            )}
            {task.completedAt && task.closed && task.objectionDeadlineAt && (
              <Text style={{ color: colors.textSecondary }}>
                {t('client.closedOn', {
                  date: formatDateTime(task.objectionDeadlineAt, i18n.language).slice(0, 10),
                })}
              </Text>
            )}
            {task.canFileObjection || task.canRate
              ? task.objectionDeadlineAt && (
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                    {t('client.deadline', {
                      date: formatDateTime(task.objectionDeadlineAt, i18n.language),
                    })}
                  </Text>
                )
              : null}
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
  box: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 96, height: 96, borderRadius: 8 },
  expired: {
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
});
