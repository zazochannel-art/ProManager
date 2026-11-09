import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Plain GET search box: submitting reloads the page with ?q=…, keeping the
 * other filters as hidden fields. Works without JavaScript.
 */
export function SearchForm({ action, value, label, placeholder, keep = {} }: { action: string; value?: string; label: string; placeholder: string; keep?: Record<string, string | undefined> }) {
  return (
    <form action={action} method="get" role="search" className="relative w-full sm:max-w-xs">
      {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input type="search" name="q" defaultValue={value} aria-label={label} placeholder={placeholder} className="pl-9" maxLength={100} />
    </form>
  );
}
