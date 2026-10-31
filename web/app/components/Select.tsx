import * as RadixSelect from '@radix-ui/react-select';

interface Option {
  value: string;
  label: string;
  disabled?: boolean;
  // Shown in the dropdown only (outside ItemText), so the closed trigger shows just the label.
  tag?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  full?: boolean;
  placeholder?: string;
  testId?: string;
}

export function Select({ value, onChange, options, full = false, placeholder, testId }: Props) {
  return (
    <RadixSelect.Root value={value || undefined} onValueChange={onChange}>
      <RadixSelect.Trigger className={`select-field${full ? ' select-field--full' : ''}`} data-testid={testId}>
        <RadixSelect.Value placeholder={placeholder} />
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content className="select-pop" position="popper" sideOffset={4}>
          <RadixSelect.Viewport>
            {options.map((o) => (
              <RadixSelect.Item key={o.value} value={o.value} disabled={o.disabled} className="select-pop__item">
                <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
                {o.tag && <span className="select-pop__tag">{o.tag}</span>}
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
