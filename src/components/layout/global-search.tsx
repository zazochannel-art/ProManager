"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, FileText, Receipt, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils/cn";
import { globalSearchAction, type SearchResult } from "@/features/search/actions/search-actions";

const ICONS = { customer: Users, project: Briefcase, invoice: Receipt, estimate: FileText } as const;

export function GlobalSearch() {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pending, startTransition] = useTransition();
  const requestId = useRef(0);

  // Ctrl/Cmd + K opens search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await globalSearchAction(trimmed);
        if (id !== requestId.current) return; // a newer query superseded this one
        if (result.ok) {
          setResults(result.data);
          setError(false);
          setActiveIndex(0);
        } else {
          setResults([]);
          setError(true);
        }
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  function go(result: SearchResult) {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(result.href);
  }

  const showResults = query.trim().length >= 2;

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} className="w-9 px-0 sm:w-64 sm:justify-start sm:px-3" aria-label={t.shell.search}>
        <Search aria-hidden="true" />
        <span className="hidden truncate text-muted-foreground sm:inline">{t.shell.searchPlaceholder}</span>
        <kbd className="ml-auto hidden rounded border border-border px-1.5 text-[10px] text-muted-foreground md:inline">Ctrl K</kbd>
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setQuery("");
            setResults([]);
          }
        }}
      >
        <DialogContent className="top-[15%] translate-y-0 gap-0 p-0" closeLabel={t.common.close}>
          <DialogTitle className="sr-only">{t.shell.search}</DialogTitle>
          <DialogDescription className="sr-only">{t.shell.searchHint}</DialogDescription>
          <div className="flex items-center gap-2 border-b border-border px-4">
            <Search className="size-4 text-muted-foreground" aria-hidden="true" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActiveIndex((i) => Math.min(i + 1, results.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveIndex((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter" && results[activeIndex]) {
                  e.preventDefault();
                  go(results[activeIndex]);
                }
              }}
              placeholder={t.shell.searchPlaceholder}
              aria-label={t.shell.search}
              role="combobox"
              aria-expanded={showResults && results.length > 0}
              aria-controls="global-search-results"
              className="h-12 border-0 px-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="max-h-80 overflow-y-auto p-2" aria-live="polite">
            {!showResults ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t.shell.searchHint}</p>
            ) : error ? (
              <p className="px-2 py-6 text-center text-sm text-danger">{t.common.genericError}</p>
            ) : results.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">{pending ? t.common.loading : t.common.noResults}</p>
            ) : (
              <ul id="global-search-results" role="listbox" aria-label={t.shell.search}>
                {results.map((result, index) => {
                  const Icon = ICONS[result.type];
                  return (
                    <li key={`${result.type}-${result.id}`} role="option" aria-selected={index === activeIndex}>
                      <button
                        type="button"
                        onClick={() => go(result)}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm", index === activeIndex && "bg-muted")}
                      >
                        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{result.title}</span>
                          {result.subtitle ? <span className="block truncate text-xs text-muted-foreground">{result.subtitle}</span> : null}
                        </span>
                        <span className="text-xs text-muted-foreground">{t.shell.searchTypes[result.type]}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
