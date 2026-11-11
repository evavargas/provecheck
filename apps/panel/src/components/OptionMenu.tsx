import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, type LucideIcon } from 'lucide-react';

export interface Option<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

/** Dropdown built on Radix (no native <select>); keyboard, focus and ARIA come from the primitive. */
export function OptionMenu<T extends string>(props: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
}) {
  const current = props.options.find((o) => o.value === props.value)!;
  const CurrentIcon = current.icon;
  return (
    <Menu.Root>
      <Menu.Trigger className="menu-trigger" aria-label={`${props.label}: ${current.label}`}>
        {CurrentIcon && <CurrentIcon size={18} aria-hidden />}
        <span>{current.label}</span>
        <ChevronDown size={16} aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="menu-content" align="end" sideOffset={6}>
          <Menu.RadioGroup value={props.value} onValueChange={(v) => props.onChange(v as T)}>
            {props.options.map(({ value, label, icon: Icon }) => (
              <Menu.RadioItem key={value} value={value} className="menu-item">
                {Icon && <Icon size={18} aria-hidden />}
                <span>{label}</span>
                <Menu.ItemIndicator className="menu-check">
                  <Check size={16} aria-hidden />
                </Menu.ItemIndicator>
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
