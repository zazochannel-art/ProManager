import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema, resetPasswordSchema } from "@/features/auth/schemas/auth";
import { safeRedirectPath, isAuthOnlyPath, isProtectedPath } from "@/lib/auth/routes";

const valid = { fullName: "Ana Popescu", email: "ana@example.com", password: "Sigur12345", confirmPassword: "Sigur12345" };

function firstError(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }, field: string) {
  return result.error?.issues.find((i) => i.path.join(".") === field)?.message;
}

describe("registration validation", () => {
  it("accepts a valid registration", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it("requires a name and a valid e-mail", () => {
    const r = registerSchema.safeParse({ ...valid, fullName: " ", email: "not-an-email" });
    expect(r.success).toBe(false);
    expect(firstError(r, "fullName")).toBeDefined();
    expect(firstError(r, "email")).toBe("email");
  });

  it("enforces the password policy", () => {
    expect(firstError(registerSchema.safeParse({ ...valid, password: "short1", confirmPassword: "short1" }), "password")).toBe("passwordWeak");
    expect(firstError(registerSchema.safeParse({ ...valid, password: "onlyletterslong", confirmPassword: "onlyletterslong" }), "password")).toBe(
      "passwordWeak",
    );
    expect(firstError(registerSchema.safeParse({ ...valid, password: "1234567890123", confirmPassword: "1234567890123" }), "password")).toBe(
      "passwordWeak",
    );
    const long = `a1${"é".repeat(40)}`; // > 72 bytes in UTF-8
    expect(firstError(registerSchema.safeParse({ ...valid, password: long, confirmPassword: long }), "password")).toBe("maxLength:72");
  });

  it("requires matching password confirmation", () => {
    expect(firstError(registerSchema.safeParse({ ...valid, confirmPassword: "Different123" }), "confirmPassword")).toBe("passwordsMismatch");
    expect(firstError(resetPasswordSchema.safeParse({ password: "Sigur12345", confirmPassword: "x" }), "confirmPassword")).toBe("passwordsMismatch");
  });

  it("normalises the e-mail address", () => {
    const r = loginSchema.safeParse({ email: "  Ana@Example.COM ", password: "x" });
    expect(r.success && r.data.email).toBe("ana@example.com");
  });
});

describe("redirect safety and route classification", () => {
  it("only allows same-origin relative redirects", () => {
    expect(safeRedirectPath("/dashboard/projects")).toBe("/dashboard/projects");
    expect(safeRedirectPath("https://evil.example")).toBe("/dashboard");
    expect(safeRedirectPath("//evil.example")).toBe("/dashboard");
    expect(safeRedirectPath("/\\evil.example")).toBe("/dashboard");
    expect(safeRedirectPath("/ok\nSet-Cookie:x")).toBe("/dashboard");
    expect(safeRedirectPath(undefined, "/onboarding")).toBe("/onboarding");
  });

  it("classifies protected and auth-only routes", () => {
    expect(isProtectedPath("/dashboard")).toBe(true);
    expect(isProtectedPath("/dashboard/settings")).toBe(true);
    expect(isProtectedPath("/onboarding")).toBe(true);
    expect(isProtectedPath("/dashboarding")).toBe(false);
    expect(isProtectedPath("/login")).toBe(false);
    expect(isAuthOnlyPath("/login")).toBe(true);
    expect(isAuthOnlyPath("/reset-password")).toBe(false);
  });
});
