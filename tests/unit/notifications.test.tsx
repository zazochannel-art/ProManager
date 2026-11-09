import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n/client";
import { en } from "@/lib/i18n/dictionaries/en";
import { interpolate } from "@/lib/i18n";
import { channelEnabled } from "@/features/notifications/schemas/events";

vi.mock("server-only", () => ({}));
vi.mock("@/config/env", () => ({ getPublicEnv: () => ({ NEXT_PUBLIC_APP_URL: "https://app.test" }) }));
const sendEmail = vi.fn(async (_m: { to: string; subject: string }) => ({ sent: true as const }));
vi.mock("@/lib/email/send", () => ({ sendEmail: (m: { to: string; subject: string }) => sendEmail(m), escapeHtml: (s: string) => s }));
const setPref = vi.fn(async (..._a: unknown[]) => ({ ok: true as const, data: undefined }));
vi.mock("@/features/notifications/actions/notification-actions", () => ({ setNotificationPreferenceAction: (...a: unknown[]) => setPref(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const ORG = "11111111-1111-4111-8111-111111111111";
const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACC = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACTOR = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

/** A tiny stand-in for the admin client that records filters and inserts. */
type Call = { table: string; filters: unknown[][]; insert?: unknown };
let calls: Call[] = [];
let tables: Record<string, unknown[]> = {};
function admin() {
  return {
    from(table: string) {
      const call: Call = { table, filters: [] };
      calls.push(call);
      const self: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is"]) {
        self[m] = (...args: unknown[]) => {
          if (m !== "select") call.filters.push([m, ...args]);
          return self;
        };
      }
      self.insert = async (rows: unknown) => {
        call.insert = rows;
        return { error: null };
      };
      self.maybeSingle = async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null });
      self.then = (resolve: (v: unknown) => void) => resolve({ data: tables[table] ?? [], error: null });
      return self;
    },
  } as never;
}

const { notify } = await import("@/features/notifications/services/notify");
const { NotificationPreferences, eventsForRole } = await import("@/features/notifications/components/notification-preferences");

beforeEach(() => {
  calls = [];
  sendEmail.mockClear();
  tables = {
    organization_members: [
      { user_id: OWNER, role: "owner" },
      { user_id: ACC, role: "accountant" },
      { user_id: ACTOR, role: "accountant" },
    ],
    profiles: [
      { id: OWNER, email: "owner@firm.md", locale: "ro" },
      { id: ACC, email: "acc@firm.md", locale: "en" },
    ],
    notification_preferences: [{ user_id: ACC, event_type: "payment.recorded", channel: "email", enabled: true }],
    organizations: [{ name: "Construct SRL" }],
  };
});

const input = {
  organizationId: ORG,
  event: "payment.recorded" as const,
  actorId: ACTOR,
  link: "/dashboard/invoices/x",
  message: (t: typeof en) => ({ title: interpolate(t.notifications.events["payment.recorded"].title, { amount: "100" }), body: "Ana" }),
};

describe("notification choices", () => {
  it("defaults to in-app on and e-mail off", () => {
    expect(channelEnabled([], "stock.low", "in_app")).toBe(true);
    expect(channelEnabled([], "stock.low", "email")).toBe(false);
    expect(channelEnabled([{ event_type: "stock.low", channel: "in_app", enabled: false }], "stock.low", "in_app")).toBe(false);
  });

  it("offers each role only its events", () => {
    expect(eventsForRole("employee")).toEqual(["task.assigned"]);
    expect(eventsForRole("accountant")).toEqual(["task.assigned", "payment.recorded"]);
    expect(eventsForRole("manager")).toEqual(["task.assigned", "stock.low", "portal.opened"]);
    expect(eventsForRole("owner")).toHaveLength(5);
  });
});

describe("notify", () => {
  it("tells the audience in their own language, skips the actor, and e-mails only those who chose it", async () => {
    const result = await notify(input, admin());
    expect(result).toEqual({ inApp: 2, emailed: 1 });
    const members = calls.find((c) => c.table === "organization_members")!;
    expect(members.filters).toContainEqual(["eq", "organization_id", ORG]);
    expect(members.filters).toContainEqual(["eq", "status", "active"]);
    expect(members.filters).toContainEqual(["in", "role", ["owner", "admin", "accountant"]]);
    const inserted = calls.find((c) => c.table === "notifications")!.insert as { user_id: string; title: string; organization_id: string }[];
    expect(inserted.map((r) => r.user_id).sort()).toEqual([OWNER, ACC].sort());
    expect(inserted.every((r) => r.organization_id === ORG)).toBe(true);
    expect(inserted.find((r) => r.user_id === OWNER)!.title).toBe("Plată primită: 100");
    expect(inserted.find((r) => r.user_id === ACC)!.title).toBe("Payment received: 100");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]![0].to).toBe("acc@firm.md");
  });

  it("can send only e-mail, to named people", async () => {
    tables.notification_preferences = [{ user_id: OWNER, event_type: "task.assigned", channel: "email", enabled: true }];
    const result = await notify({ ...input, event: "task.assigned", userIds: [OWNER], inApp: false }, admin());
    expect(result).toEqual({ inApp: 0, emailed: 1 });
    expect(calls.find((c) => c.table === "notifications")).toBeUndefined();
    expect(calls.find((c) => c.table === "organization_members")!.filters).toContainEqual(["in", "user_id", [OWNER]]);
  });

  it("never throws", async () => {
    const broken = { from: () => { throw new Error("down"); } } as never;
    await expect(notify(input, broken)).resolves.toEqual({ inApp: 0, emailed: 0 });
  });
});

describe("NotificationPreferences", () => {
  it("saves a choice and explains when e-mail is not set up", async () => {
    render(
      <I18nProvider locale="en" dictionary={en}>
        <NotificationPreferences role="accountant" rows={[]} emailConfigured={false} />
      </I18nProvider>,
    );
    expect(screen.getByText(/E-mail sending is not set up yet/)).toBeInTheDocument();
    expect(screen.queryByText("Stock below minimum")).not.toBeInTheDocument();
    const box = screen.getByRole("checkbox", { name: "Payment recorded: E-mail" });
    expect(box).not.toBeChecked();
    await userEvent.setup().click(box);
    expect(setPref).toHaveBeenCalledWith("payment.recorded", "email", true);
    expect(screen.getByRole("checkbox", { name: "Payment recorded: E-mail" })).toBeChecked();
  });
});
