"use client";

/**
 * Last-resort error boundary (replaces the root layout, so no providers or
 * translations are available here). Shows a neutral trilingual message and
 * never renders error details.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  console.error("global_error", error.digest ?? "unknown");
  return (
    <html lang="ro">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#F7F8FA", color: "#111827", margin: 0 }}>
        <main style={{ maxWidth: 480, margin: "15vh auto", padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20 }}>A apărut o eroare · Something went wrong · Произошла ошибка</h1>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 16, padding: "10px 16px", borderRadius: 10, border: 0, background: "#2563EB", color: "#fff", cursor: "pointer" }}
          >
            Reîncearcă · Retry · Повторить
          </button>
        </main>
      </body>
    </html>
  );
}
