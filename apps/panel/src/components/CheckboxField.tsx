import * as Checkbox from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { useId } from 'react';

export function CheckboxField(props: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="check">
      <Checkbox.Root
        id={id}
        className="checkbox"
        checked={props.checked}
        onCheckedChange={(v) => props.onChange(v === true)}
      >
        <Checkbox.Indicator>
          <Check size={16} strokeWidth={3} aria-hidden />
        </Checkbox.Indicator>
      </Checkbox.Root>
      <label htmlFor={id}>{props.label}</label>
    </div>
  );
}
