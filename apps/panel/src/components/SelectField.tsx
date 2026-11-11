import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { useId } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

/** Form select built on Radix (no native <select>). */
export function SelectField(props: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (v: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      <Select.Root value={props.value} onValueChange={props.onChange} disabled={props.disabled}>
        <Select.Trigger id={id} className="select-trigger">
          <Select.Value />
          <Select.Icon>
            <ChevronDown size={18} aria-hidden />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className="menu-content select-content" position="popper" sideOffset={4}>
            <Select.Viewport>
              {props.options.map((o) => (
                <Select.Item key={o.value} value={o.value} className="menu-item">
                  <Select.ItemText>{o.label}</Select.ItemText>
                  <Select.ItemIndicator className="menu-check">
                    <Check size={16} aria-hidden />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
      {props.hint && <p className="hint">{props.hint}</p>}
    </div>
  );
}
