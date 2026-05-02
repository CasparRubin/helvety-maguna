import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type ThemePreference, useTheme } from "@/context/theme-context";

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

export function ThemePreferenceRow() {
  const { preference, setPreference } = useTheme();

  return (
    <div className="px-1">
      <div
        className="flex gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5"
        role="group"
        aria-label="Theme"
      >
        {OPTIONS.map(({ value, label, icon: Icon }) => (
          <Button
            key={value}
            type="button"
            variant={preference === value ? "secondary" : "ghost"}
            size="sm"
            className={cn(
              "h-8 min-w-0 flex-1 px-0 text-muted-foreground",
              preference === value && "text-foreground shadow-sm",
            )}
            onClick={() => setPreference(value)}
            aria-pressed={preference === value}
            aria-label={label}
            title={label}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
          </Button>
        ))}
      </div>
    </div>
  );
}
