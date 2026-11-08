import type { Dictionary } from "@/lib/i18n";
import { interpolate } from "@/lib/i18n";

type ValidationKey = keyof Dictionary["validation"];

/** Turns a schema message key such as "minLength:2" into localized text. */
export function translateValidationMessage(t: Dictionary, message: string | undefined): string | undefined {
  if (!message) return undefined;
  const [key, param] = message.split(":");
  if (key && key in t.validation) {
    const template = t.validation[key as ValidationKey];
    return interpolate(template, { min: param ?? "", max: param ?? "" });
  }
  return t.common.genericError;
}
