# ProManager

ProManager is a Romanian-language web app for service businesses, with construction and installation teams as the first target group.

## Run locally on Windows

Use the Windows command shim in PowerShell so the execution policy does not block npm:

```powershell
npm.cmd install
npm.cmd run dev
```

Open the local URL printed by Vite. Do not open `index.html` directly from File Explorer.

## Supabase

The hosted Supabase project for ProManager is configured at `https://hnrxjodakqokvpsuzbml.supabase.co`. The browser environment uses the project's publishable key only; the `service_role` key must never be placed in frontend code.

Copy `.env.example` to `.env.local` if you need to configure another machine. Database migrations are in `supabase/migrations`; they create organization-scoped customers, jobs, quotes, invoices, line items, and expenses with Row Level Security enabled.

The current dashboard still displays demo records stored in the browser's local storage. Sign-in and database-backed screens are the next implementation step.

## Current modules

- Overview dashboard
- Jobs and calendar
- Customers
- Quotes
- Expenses