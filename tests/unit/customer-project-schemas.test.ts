import { describe, expect, it } from "vitest";
import { addressSchema, contactSchema, customerUpdateSchema } from "@/features/customers/schemas/customer";
import { taskCreateSchema, taskStatusSchema } from "@/features/projects/schemas/project";

describe("customer detail schemas", () => {
  const base = { type: "company", name: "Client SRL" } as const;

  it("normalizes a bare website domain to https", () => {
    const parsed = customerUpdateSchema.parse({ ...base, website: "client.md" });
    expect(parsed.website).toBe("https://client.md");
    expect(customerUpdateSchema.parse({ ...base, website: "" }).website).toBeUndefined();
  });

  it("rejects non-web URLs", () => {
    const result = customerUpdateSchema.safeParse({ ...base, website: "javascript:alert(1)" });
    expect(result.success).toBe(false);
  });

  it("requires a contact name and a valid e-mail when given", () => {
    expect(contactSchema.safeParse({ fullName: "" }).success).toBe(false);
    expect(contactSchema.safeParse({ fullName: "Ion", email: "nu-e-email" }).success).toBe(false);
    expect(contactSchema.parse({ fullName: " Ion ", email: "ION@Client.MD" })).toMatchObject({ fullName: "Ion", email: "ion@client.md", isPrimary: false });
  });

  it("uppercases the address country and limits it to 2 letters", () => {
    expect(addressSchema.parse({ type: "site", line1: "str. Mihai Eminescu 5", countryCode: "md" }).countryCode).toBe("MD");
    expect(addressSchema.safeParse({ type: "site", line1: "x", countryCode: "MDA" }).success).toBe(false);
    expect(addressSchema.safeParse({ type: "office", line1: "x", countryCode: "MD" }).success).toBe(false);
  });
});

describe("project task schemas", () => {
  it("treats the 'none' assignee as unassigned", () => {
    expect(taskCreateSchema.parse({ title: "Demontare", priority: "high", assigneeId: "none", dueDate: "" })).toEqual({
      title: "Demontare",
      priority: "high",
      assigneeId: undefined,
      dueDate: undefined,
    });
  });

  it("rejects invalid assignees, priorities and statuses", () => {
    expect(taskCreateSchema.safeParse({ title: "x", priority: "high", assigneeId: "abc" }).success).toBe(false);
    expect(taskCreateSchema.safeParse({ title: "x", priority: "asap" }).success).toBe(false);
    expect(taskStatusSchema.safeParse("archived").success).toBe(false);
    expect(taskStatusSchema.parse("in_progress")).toBe("in_progress");
  });
});
