import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// "server-only" throws outside a React Server environment; unit tests import server modules directly.
vi.mock("server-only", () => ({}));

afterEach(() => cleanup());

// jsdom has no ResizeObserver; Radix primitives (e.g. Checkbox) measure themselves with it.
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
