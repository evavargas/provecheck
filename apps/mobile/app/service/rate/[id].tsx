import type { ClientTaskDto } from '@provecheck/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, CircleAlert, Star } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../../src/api/client';
import { Button } from '../../../src/components/Button';
import { errorText } from '../../../src/features/tasks/helpers';
import { useTheme } from '../../../src/theme/theme';

type Member = ClientTaskDto['team'][number];

function Card({
  taskId,
  member,
  onSaved,
  onError,
}: {
  taskId: string;
  member: Member;
  onSaved: (t: ClientTaskDto) => void;
  onError: (m: string) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [stars, setStars] = useState(member.myRating?.stars ?? 0);
  const [comment, setComment] = useState(member.myRating?.comment ?? '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      onSaved(await api.myServices.rate(taskId, member.assignmentId, { stars, comment }));
      setSaved(true);
    } catch (err) {
      onError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>{member.name}</Text>
      <View style={styles.stars} accessibilityRole="radiogroup">
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            accessibilityRole="radio"
            accessibilityState={{ selected: stars === n }}
            accessibilityLabel={t('client.rate.star', { n })}
            onPress={() => setStars(n)}
            hitSlop={6}
          >
            <Star size={34} color={colors.primary} fill={n <= stars ? colors.primary : 'none'} />
          </Pressable>
        ))}
      </View>
      <TextInput
        value={comment}
        onChangeText={setComment}
        multiline
        maxLength={1000}
        placeholder={t('client.rate.comment')}
        placeholderTextColor={colors.textSecondary}
        accessibilityLabel={`${t('client.rate.comment')}: ${member.name}`}
        textAlignVertical="top"
        style={[
          styles.input,
          { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
        ]}
      />
      <Button
        label={t('client.rate.save')}
        disabled={stars === 0 || busy}
        onPress={() => void save()}
      />
      {saved && (
        <Text style={{ color: colors.success, fontWeight: '600' }}>{t('client.rate.saved')}</Text>
      )}
    </View>
  );
}

export default function Rate() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const [task, setTask] = useState<ClientTaskDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.myServices.get(id).then(setTask, (err) => setError(errorText(t, err)));
  }, [id, t]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={() => router.back()}
          hitSlop={10}
        >
          <ArrowLeft size={24} color={colors.text} />
        </Pressable>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {t('client.rate.title')}
        </Text>
        <Text style={{ color: colors.textSecondary }}>{t('client.rate.note')}</Text>
        {error && (
          <View style={styles.row} accessibilityLiveRegion="polite">
            <CircleAlert size={16} color={colors.error} />
            <Text style={{ color: colors.error, flex: 1 }}>{error}</Text>
          </View>
        )}
        {!task && !error && <ActivityIndicator color={colors.primary} />}
        {task?.team.map((m) => (
          <Card key={m.assignmentId} taskId={id} member={m} onSaved={setTask} onError={setError} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, width: '100%', maxWidth: 560, alignSelf: 'center' },
  title: { fontSize: 22, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 12 },
  stars: { flexDirection: 'row', gap: 6 },
  input: { minHeight: 80, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16 },
});
