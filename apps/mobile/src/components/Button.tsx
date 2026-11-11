import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme/theme';

export function Button(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'outline';
}) {
  const { colors } = useTheme();
  const primary = (props.variant ?? 'primary') === 'primary';
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!props.disabled }}
      style={[
        styles.button,
        primary
          ? { backgroundColor: colors.primary }
          : { borderColor: colors.border, borderWidth: 1 },
        props.disabled && { opacity: 0.5 },
      ]}
    >
      <Text style={[styles.label, { color: primary ? colors.onPrimary : colors.text }]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  label: { fontSize: 16, fontWeight: '600' },
});
