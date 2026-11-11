import { Check, ChevronDown, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/theme';

export interface Option<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

/** Dropdown for compact preferences: a pill that opens a menu in a modal (no native picker). */
export function OptionMenu<T extends string>(props: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const current = props.options.find((o) => o.value === props.value)!;
  const CurrentIcon = current.icon;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${props.label}: ${current.label}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={[styles.pill, { borderColor: colors.border, backgroundColor: colors.surface }]}
      >
        {CurrentIcon && <CurrentIcon size={18} color={colors.textSecondary} />}
        <Text style={{ color: colors.text }}>{current.label}</Text>
        <ChevronDown size={16} color={colors.textSecondary} />
      </Pressable>
      <Modal transparent animationType="fade" visible={open} onRequestClose={() => setOpen(false)}>
        <Pressable
          style={styles.backdrop}
          onPress={() => setOpen(false)}
          accessibilityLabel={props.label}
        >
          <View
            style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
            accessibilityRole="menu"
          >
            <Text style={[styles.heading, { color: colors.textSecondary }]}>{props.label}</Text>
            {props.options.map(({ value, label, icon: Icon }) => (
              <Pressable
                key={value}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: value === props.value }}
                onPress={() => {
                  props.onChange(value);
                  setOpen(false);
                }}
                style={styles.item}
              >
                {Icon && <Icon size={20} color={colors.textSecondary} />}
                <Text style={{ color: colors.text, flex: 1, fontSize: 16 }}>{label}</Text>
                {value === props.value && <Check size={20} color={colors.primary} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  sheet: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 8,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  heading: { fontSize: 12, paddingHorizontal: 12, paddingVertical: 8 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
});
