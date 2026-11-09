import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n/client";
import { en } from "@/lib/i18n/dictionaries/en";
import { addDays, partsInTimeZone, zonedTimeToUtc } from "@/lib/utils/dates";
import { eventCreateSchema } from "@/features/calendar/schemas/event";
import { monthGrid } from "@/features/calendar/services/calendar-service";

vi.mock("@/features/calendar/actions/event-actions", () => ({ createEventAction: vi.fn(), deleteEventAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/" }));

const { CalendarView } = await import("@/features/calendar/components/calendar-view");

const withI18n = (children: ReactNode) => (
  <I18nProvider locale="en" dictionary={en}>
    {children}
  </I18nProvider>
);

describe("time zone helpers", () => {
  it("convert Chisinau wall-clock time to UTC across DST", () => {
    expect(zonedTimeToUtc("2026-11-08", "09:30", "Europe/Chisinau")).toBe("2026-11-08T07:30:00.000Z"); // winter, UTC+2
    expect(zonedTimeToUtc("2026-07-01", "09:30", "Europe/Chisinau")).toBe("2026-07-01T06:30:00.000Z"); // summer, UTC+3
    expect(zonedTimeToUtc("2026-07-01", "09:30", "Europe/Berlin")).toBe("2026-07-01T07:30:00.000Z");
  });

  it("read an instant back in the organization's zone", () => {
    expect(partsInTimeZone("2026-11-08T22:30:00Z", "Europe/Bucharest")).toEqual({ date: "2026-11-09", time: "00:30" });
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("monthGrid", () => {
  it("covers whole Monday-first weeks", () => {
    const grid = monthGrid("2026-11");
    expect(grid.first).toBe("2026-10-26");
    expect(grid.last).toBe("2026-12-06");
    expect(grid.days).toHaveLength(42);
  });
});

describe("eventCreateSchema", () => {
  const base = { title: "Site visit", allDay: false, startDate: "2026-11-10", startTime: "09:00", endDate: "2026-11-10", endTime: "10:00" };
  it("requires times for timed events and a valid order", () => {
    expect(eventCreateSchema.safeParse(base).success).toBe(true);
    expect(eventCreateSchema.safeParse({ ...base, endTime: "08:00" }).success).toBe(false);
    expect(eventCreateSchema.safeParse({ ...base, startTime: "" }).success).toBe(false);
    expect(eventCreateSchema.safeParse({ ...base, allDay: true, startTime: "", endTime: "" }).success).toBe(true);
    expect(eventCreateSchema.safeParse({ ...base, startTime: "25:00" }).success).toBe(false);
  });
});

describe("CalendarView", () => {
  it("places events and task deadlines on their days and opens details", async () => {
    const user = userEvent.setup();
    const grid = monthGrid("2026-11");
    render(
      withI18n(
        <CalendarView
          month="2026-11"
          days={grid.days}
          today="2026-11-08"
          canWrite={false}
          items={[
            { kind: "event", id: "e1", title: "Site visit", time: "09:00", endTime: "10:00", allDay: false, location: "Str. Mihai Eminescu 5", startDate: "2026-11-10", endDate: "2026-11-10" },
            { kind: "task", id: "t1", title: "Order tiles", allDay: true, status: "todo", projectId: null, startDate: "2026-11-12", endDate: "2026-11-12" },
          ]}
        />,
      ),
    );
    expect(screen.getAllByRole("button", { name: /Order tiles/ }).length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole("button", { name: /Site visit/ })[0]!);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Str. Mihai Eminescu 5")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: en.common.delete })).not.toBeInTheDocument();
  });
});
