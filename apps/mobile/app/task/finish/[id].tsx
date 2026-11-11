import {
  ApiRequestError,
  formatTime,
  parseReportText,
  reportContentSchema,
  type CollaboratorTaskDto,
  type ReportContent,
} from '@provecheck/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Bold, CircleAlert, List, TriangleAlert } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../../src/api/client';
import { Button } from '../../../src/components/Button';
import { errorText, newId } from '../../../src/features/tasks/helpers';
import { useTheme } from '../../../src/theme/theme';

function Preview({ content }: { content: ReportContent }) {
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

export default function Finish() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const [task, setTask] = useState<CollaboratorTaskDto | null>(null);
  const [text, setText] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const loaded = useRef(false);
  // One id per finish attempt: a retry after a dropped connection must not create a second record.
  const reportId = useRef(newId());
  const startedAt = useRef(new Date().toISOString());

  useEffect(() => {
    void (async () => {
      try {
        setTask(await api.myTasks.get(id));
        const draft = (await api.myTasks.getDraft(id)).contentJson as { text?: string } | null;
        if (draft?.text) setText(draft.text);
      } catch (err) {
        setError(errorText(t, err));
      } finally {
        loaded.current = true;
      }
    })();
  }, [id, t]);

  // Autosave (F7.3): best effort, a failure never blocks writing.
  useEffect(() => {
    if (!loaded.current || !text) return;
    const timer = setTimeout(() => {
      api.myTasks.saveDraft(id, { text }).then(
        () => setSaved(true),
        () => setSaved(false),
      );
    }, 1500);
    return () => clearTimeout(timer);
  }, [text, id]);

  const parsed = parseReportText(text);
  const valid = reportContentSchema.safeParse(parsed).success;

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      await api.myTasks.finalize(id, {
        reportId: reportId.current,
        contentJson: parsed,
        deviceCompletedAt: startedAt.current,
        deviceSentAt: new Date().toISOString(),
      });
      router.dismissAll();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'ALREADY_FINALIZED') {
        setError(t('collab.finish.alreadyDone'));
        setReviewing(false);
      } else {
        setError(errorText(t, err));
      }
    } finally {
      setBusy(false);
    }
  }

  const tool = (label: string, Icon: typeof Bold, add: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() =>
        setText((v) =>
          add === '**' ? `${v}****` : `${v}${v && !v.endsWith('\n') ? '\n' : ''}${add}`,
        )
      }
      style={[styles.tool, { borderColor: colors.border, backgroundColor: colors.surface }]}
    >
      <Icon size={20} color={colors.primary} />
      <Text style={{ color: colors.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={() => (reviewing ? setReviewing(false) : router.back())}
          hitSlop={10}
        >
          <ArrowLeft size={24} color={colors.text} />
        </Pressable>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {reviewing ? t('collab.finish.reviewTitle') : t('collab.finish.title')}
        </Text>
        {error && (
          <View style={styles.inline} accessibilityLiveRegion="polite">
            <CircleAlert size={16} color={colors.error} />
            <Text style={{ color: colors.error, flex: 1 }}>{error}</Text>
          </View>
        )}
        {!reviewing ? (
          <>
            <Text style={{ color: colors.textSecondary }}>{t('collab.finish.hint')}</Text>
            <View style={styles.inline}>
              {tool(t('collab.finish.bold'), Bold, '**')}
              {tool(t('collab.finish.bullet'), List, '- ')}
            </View>
            <TextInput
              value={text}
              onChangeText={(v) => {
                setSaved(false);
                setText(v);
              }}
              multiline
              placeholder={t('collab.finish.placeholder')}
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel={t('collab.finish.title')}
              maxLength={10000}
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
              ]}
              textAlignVertical="top"
            />
            {saved && (
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                {t('collab.finish.saved')}
              </Text>
            )}
            {!valid && text.length > 0 && (
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                {t('collab.finish.empty')}
              </Text>
            )}
            <Button
              label={t('collab.finish.review')}
              disabled={!valid}
              onPress={() => setReviewing(true)}
            />
          </>
        ) : (
          <>
            <Preview content={parsed} />
            {task?.myArrivedAt && (
              <Text style={{ color: colors.textSecondary }}>
                {t('collab.finish.arrival')}: {formatTime(task.myArrivedAt, i18n.language)} ·{' '}
                {task.myAttendanceDelayed
                  ? t('collab.finish.delayed')
                  : t('collab.finish.notDelayed')}
              </Text>
            )}
            <View style={[styles.warn, { borderColor: colors.warning }]}>
              <TriangleAlert size={20} color={colors.text} />
              <Text style={{ color: colors.text, flex: 1, fontWeight: '600' }}>
                {t('collab.finish.warning')}
              </Text>
            </View>
            <Button
              label={busy ? t('collab.finish.sending') : t('collab.finish.confirm')}
              disabled={busy}
              onPress={() => void finish()}
            />
            <Button
              variant="outline"
              label={t('collab.finish.back')}
              disabled={busy}
              onPress={() => setReviewing(false)}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
  title: { fontSize: 22, fontWeight: '600' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  input: { minHeight: 220, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16 },
  warn: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 10,
    padding: 12,
  },
});
