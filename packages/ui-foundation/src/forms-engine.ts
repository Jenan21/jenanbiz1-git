export type FormState =
  | "idle"
  | "loading"
  | "success"
  | "error"
  | "disabled"
  | "readonly";

export interface ValidationIssue {
  field: string;
  code: "required" | "invalid" | "min" | "max";
  message: string;
}

export interface FieldSpec {
  name: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
}

export function validateTextField(
  value: string,
  spec: FieldSpec,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const normalized = value.trim();

  if (spec.required && !normalized) {
    issues.push({ field: spec.name, code: "required", message: "required" });
    return issues;
  }
  if (spec.minLength && normalized.length < spec.minLength) {
    issues.push({ field: spec.name, code: "min", message: `min:${spec.minLength}` });
  }
  if (spec.maxLength && normalized.length > spec.maxLength) {
    issues.push({ field: spec.name, code: "max", message: `max:${spec.maxLength}` });
  }
  return issues;
}

export function canSubmitForm(
  state: FormState,
  issues: readonly ValidationIssue[],
): boolean {
  if (state === "loading" || state === "disabled" || state === "readonly") {
    return false;
  }
  return issues.length === 0;
}
