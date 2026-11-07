import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n/client";
import { en } from "@/lib/i18n/dictionaries/en";
import { EmptyState } from "@/components/shared/empty-state";

const signUpAction = vi.fn();
const signInAction = vi.fn();
vi.mock("@/features/auth/actions/auth-actions", () => ({
  signUpAction: (...args: unknown[]) => signUpAction(...args),
  signInAction: (...args: unknown[]) => signInAction(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/" }));

const { RegisterForm } = await import("@/features/auth/components/register-form");
const { LoginForm } = await import("@/features/auth/components/login-form");

function withI18n(children: ReactNode) {
  return (
    <I18nProvider locale="en" dictionary={en}>
      {children}
    </I18nProvider>
  );
}

describe("RegisterForm", () => {
  it("shows translated validation errors and does not call the server", async () => {
    const user = userEvent.setup();
    render(withI18n(<RegisterForm />));
    await user.click(screen.getByRole("button", { name: en.auth.createAccount }));
    expect(await screen.findAllByText(en.validation.required)).not.toHaveLength(0);
    expect(signUpAction).not.toHaveBeenCalled();
  });

  it("rejects a weak password and mismatched confirmation", async () => {
    const user = userEvent.setup();
    render(withI18n(<RegisterForm />));
    await user.type(screen.getByLabelText(en.auth.fullName), "Ana Popescu");
    await user.type(screen.getByLabelText(en.auth.email), "ana@example.com");
    await user.type(screen.getByLabelText(en.auth.password), "short");
    await user.type(screen.getByLabelText(en.auth.confirmPassword), "other");
    await user.click(screen.getByRole("button", { name: en.auth.createAccount }));
    expect(await screen.findByText(en.validation.passwordWeak)).toBeInTheDocument();
    expect(signUpAction).not.toHaveBeenCalled();
  });
});

describe("LoginForm", () => {
  it("submits valid credentials to the server action", async () => {
    signInAction.mockResolvedValue({ ok: false, error: "validation", fieldErrors: {} });
    const user = userEvent.setup();
    render(withI18n(<LoginForm nextPath="/dashboard" />));
    await user.type(screen.getByLabelText(en.auth.email), "ana@example.com");
    await user.type(screen.getByLabelText(en.auth.password), "whatever-password");
    await user.click(screen.getByRole("button", { name: en.auth.signIn }));
    await vi.waitFor(() => expect(signInAction).toHaveBeenCalledWith({ email: "ana@example.com", password: "whatever-password" }, "/dashboard"));
  });

  it("shows the invalid-credentials message returned by the server", async () => {
    signInAction.mockResolvedValue({ ok: false, error: "unauthenticated", authError: "invalid_credentials" });
    const user = userEvent.setup();
    render(withI18n(<LoginForm nextPath="/dashboard" />));
    await user.type(screen.getByLabelText(en.auth.email), "ana@example.com");
    await user.type(screen.getByLabelText(en.auth.password), "wrong-password");
    await user.click(screen.getByRole("button", { name: en.auth.signIn }));
    expect(await screen.findByText(en.auth.errors.invalidCredentials)).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("renders title, description and action", () => {
    render(<EmptyState title="Nothing here" description="Add the first item" action={<button type="button">Add</button>} />);
    expect(screen.getByRole("heading", { name: "Nothing here" })).toBeInTheDocument();
    expect(screen.getByText("Add the first item")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });
});
