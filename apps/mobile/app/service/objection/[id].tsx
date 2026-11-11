import { ApiRequestError, MAX_OBJECTION_ATTACHMENTS } from '@provecheck/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Camera, CircleAlert, Image as ImageIcon, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
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
import { useAttachments } from '../../../src/features/client/useAttachments';
import { errorText } from '../../../src/features/tasks/helpers';
import { useTheme } from '../../../src/theme/theme';

export default function FileObjection() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const files = useAttachments(id, (err) => setError(errorText(t, err)));
  const valid = text.trim().length >= 5;

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api.myServices.fileObjection(id, {
        stagingId: files.stagingId,
        description: text,
        attachmentIds: files.doneIds,
      });
      router.back();
    } catch (err) {
      setConfirming(false);
      // No cola local: this action needs a connection, and the text stays on screen to retry (spec M-32).
      setError(
        err instanceof ApiRequestError ? errorText(t, err) : t('client.objection.needsConnection'),
      );
    } finally {
      setBusy(false);
    }
  }

  const pick = (label: string, Icon: typeof Camera, source: 'camera' | 'library') => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => void files.add(source)}
      disabled={files.items.length >= MAX_OBJECTION_ATTACHMENTS}
      style={[
        styles.tool,
        {
          borderColor: colors.border,
          backgroundColor: colors.surface,
          opacity: files.items.length >= MAX_OBJECTION_ATTACHMENTS ? 0.5 : 1,
        },
      ]}
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
          onPress={() => (confirming ? setConfirming(false) : router.back())}
          hitSlop={10}
        >
          <ArrowLeft size={24} color={colors.text} />
        </Pressable>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {confirming ? t('client.objection.confirmTitle') : t('client.objection.title')}
        </Text>
        {error && (
          <View style={styles.inline} accessibilityLiveRegion="polite">
            <CircleAlert size={16} color={colors.error} />
            <Text style={{ color: colors.error, flex: 1 }}>{error}</Text>
          </View>
        )}
        {confirming ? (
          <>
            <Text style={{ color: colors.text }}>{t('client.objection.confirmBody')}</Text>
            <Text style={{ color: colors.text, fontSize: 16 }}>{text}</Text>
            <Button
              label={t('client.objection.confirm')}
              disabled={busy}
              onPress={() => void send()}
            />
            <Button
              variant="outline"
              label={t('client.objection.back')}
              disabled={busy}
              onPress={() => setConfirming(false)}
            />
          </>
        ) : (
          <>
            <Text style={{ color: colors.textSecondary }}>{t('client.objection.note')}</Text>
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              maxLength={4000}
              placeholder={t('client.objection.text')}
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel={t('client.objection.text')}
              textAlignVertical="top"
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
              ]}
            />
            <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'right' }}>
              {t('client.objection.counter', { n: text.length })}
            </Text>
            <Text
              accessibilityRole="header"
              style={{ color: colors.text, fontWeight: '600', fontSize: 16 }}
            >
              {t('client.objection.images', {
                n: files.items.length,
                max: MAX_OBJECTION_ATTACHMENTS,
              })}
            </Text>
            <View style={styles.inline}>
              {pick(t('client.objection.camera'), Camera, 'camera')}
              {pick(t('client.objection.library'), ImageIcon, 'library')}
            </View>
            <View style={styles.grid}>
              {files.items.map((p) => (
                <View
                  key={p.id}
                  style={[
                    styles.thumb,
                    { borderColor: p.status === 'error' ? colors.error : colors.border },
                  ]}
                >
                  <Image
                    source={{ uri: p.uri }}
                    style={styles.thumbImg}
                    accessibilityIgnoresInvertColors
                  />
                  {p.status === 'working' && (
                    <View style={styles.overlay}>
                      <ActivityIndicator color="#FFFFFF" />
                    </View>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('client.objection.remove')}
                    onPress={() => files.remove(p.id)}
                    style={styles.remove}
                    hitSlop={6}
                  >
                    <Trash2 size={16} color="#FFFFFF" />
                  </Pressable>
                </View>
              ))}
            </View>
            {files.failed && (
              <Text style={{ color: colors.error }}>{t('client.objection.imageError')}</Text>
            )}
            {files.busy && (
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                {t('client.objection.waitUploads')}
              </Text>
            )}
            <Button
              label={t('client.objection.send')}
              disabled={!valid || files.busy || files.failed}
              onPress={() => setConfirming(true)}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, width: '100%', maxWidth: 560, alignSelf: 'center' },
  title: { fontSize: 22, fontWeight: '600' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { minHeight: 160, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16 },
  tool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 96, height: 96, borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  thumbImg: { width: 96, height: 96, borderRadius: 8 },
  overlay: {
    ...(StyleSheet.absoluteFill as object),
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    padding: 4,
  },
});
