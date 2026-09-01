import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REMINDER_LEAD_OPTIONS } from "@/lib/reminders";

type Props = {
  /** null = use the account default from Settings */
  value: number | null;
  onChange: (minutes: number | null) => void;
  label?: string;
  allowDefault?: boolean;
};

export function ReminderSelect({ value, onChange, label = "Remind me", allowDefault = true }: Props) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select
        value={value === null ? "default" : String(value)}
        onValueChange={(v) => onChange(v === "default" ? null : Number(v))}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allowDefault ? <SelectItem value="default">Use my default</SelectItem> : null}
          {REMINDER_LEAD_OPTIONS.map((o) => (
            <SelectItem key={o.minutes} value={String(o.minutes)}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
