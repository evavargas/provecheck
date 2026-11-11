import type { IconName } from '@provecheck/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '../theme/theme';
import { Icon } from './Icon';

interface Props extends Omit<TextInputProps, 'onChangeText' | 'onChange' | 'value'> {
  label: string;
  icon: IconName;
  value: string;
  onChange: (v: string) => void;
  error?: string | undefined;
  secret?: boolean;
}

export function Field({ label, icon, value, onChange, error, secret, ...rest }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <View
        style={[
          styles.wrap,
          { backgroundColor: colors.surface, borderColor: error ? colors.error : colors.border },
        ]}
      >
        <Icon name={icon} color={colors.textSecondary} />
        <TextInput
          {...rest}
          value={value}
          onChangeText={onChange}
          secureTextEntry={secret && !visible}
          accessibilityLabel={label}
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { color: colors.text }]}
        />
        {secret && (
          <Pressable
            onPress={() => setVisible((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={t(visible ? 'auth.hide' : 'auth.show')}
            hitSlop={8}
            style={styles.toggle}
          >
            <Icon name={visible ? 'visibilityOff' : 'visibility'} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>
      {error ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <Icon name="error" size={16} color={colors.error} />
          <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600' },
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 10,
  },
  input: { flex: 1, fontSize: 16, minHeight: 48 },
  toggle: { minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  error: { fontSize: 13 },
});
