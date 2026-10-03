"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/types/i18n";

const interests = [
  ["PROJECTS", "المشاريع", "Projects"],
  ["ACADEMY", "الأكاديمية", "Academy"],
  ["MARKET", "السوق", "Market"],
  ["SOFTWARE", "البرمجيات", "Software"],
  ["TALENT", "المواهب", "Talent"],
  ["MARKETING", "التسويق", "Marketing"],
  ["ROBOTICS", "الروبوتات", "Robotics"],
] as const;

export function OnboardingForm({
  initialCountryCode,
  locale,
}: {
  initialCountryCode: string;
  locale: Locale;
}) {
  const ar = locale === "ar";
  const router = useRouter();
  const [accountType, setAccountType] = useState<"INDIVIDUAL" | "ORGANIZATION">(
    "INDIVIDUAL",
  );
  const [countryCode, setCountryCode] = useState(initialCountryCode);
  const [city, setCity] = useState("");
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function toggleInterest(value: string) {
    setSelectedInterests((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountType,
          countryCode,
          city,
          interests: selectedInterests,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      if (response.ok) {
        router.replace("/dashboard");
        router.refresh();
        return;
      }
      setError(
        payload?.message ??
          (ar ? "تعذر حفظ تهيئة الحساب." : "Account setup could not be saved."),
      );
    } catch {
      setError(
        ar
          ? "تعذر الاتصال بخدمة تهيئة الحساب."
          : "Could not connect to account setup.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="onboarding-form" onSubmit={submit}>
      <div className="onboarding-form__grid">
        <label>
          {ar ? "نوع المستخدم" : "Account type"}
          <select
            disabled={busy}
            value={accountType}
            onChange={(event) =>
              setAccountType(
                event.target.value as "INDIVIDUAL" | "ORGANIZATION",
              )
            }
          >
            <option value="INDIVIDUAL">{ar ? "فرد" : "Individual"}</option>
            <option value="ORGANIZATION">
              {ar ? "منشأة" : "Organization"}
            </option>
          </select>
        </label>
        <label>
          {ar ? "الدولة" : "Country code"}
          <input
            required
            disabled={busy}
            minLength={2}
            maxLength={2}
            pattern="[A-Z]{2}"
            value={countryCode}
            onChange={(event) =>
              setCountryCode(event.target.value.toUpperCase())
            }
          />
        </label>
        <label className="onboarding-form__city">
          {ar ? "المدينة" : "City"}
          <input
            required
            disabled={busy}
            minLength={2}
            maxLength={120}
            value={city}
            onChange={(event) => setCity(event.target.value)}
          />
        </label>
      </div>
      <fieldset>
        <legend>{ar ? "اهتماماتك" : "Your interests"}</legend>
        <div className="onboarding-form__interests">
          {interests.map(([value, arabic, english]) => (
            <label key={value}>
              <input
                disabled={busy}
                type="checkbox"
                checked={selectedInterests.includes(value)}
                onChange={() => toggleInterest(value)}
              />
              <span>{ar ? arabic : english}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {error ? (
        <p className="auth-workflow__error" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="button button--primary"
        disabled={busy || selectedInterests.length === 0}
        type="submit"
      >
        {busy
          ? ar
            ? "جارٍ الحفظ..."
            : "Saving..."
          : ar
            ? "حفظ وبدء العمل"
            : "Save and continue"}
      </button>
    </form>
  );
}
