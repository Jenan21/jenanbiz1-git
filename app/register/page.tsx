import { CanonicalAuthAccessPage } from "@/components/auth/canonical-auth-access-page";
import { getRequestDictionary } from "@/lib/i18n/server";
import { readPlatformCatalog } from "@/lib/platform/catalog";

export default async function RegisterPage() {
  const [{ locale }, catalog] = await Promise.all([
    getRequestDictionary(),
    readPlatformCatalog(),
  ]);
  const ar = locale === "ar";
  return (
    <CanonicalAuthAccessPage
      locale={locale}
      mode="register"
      modules={catalog.modules.filter((module) => module.id !== "dashboard")}
      labels={{
        name: ar ? "الاسم الكامل" : "Full name",
        countryCode: ar ? "الدولة" : "Country",
        email: ar ? "البريد الإلكتروني" : "Email address",
        password: ar ? "كلمة المرور" : "Password",
        submit: ar ? "إنشاء حساب" : "Create account",
        remember: "",
        forgot: "",
        loading: ar ? "جارٍ إنشاء الحساب..." : "Creating account...",
        note: ar
          ? "كلمة المرور 12 حرفًا على الأقل"
          : "Password must contain at least 12 characters",
        errors: {
          DUPLICATE_EMAIL: ar
            ? "البريد الإلكتروني مستخدم بالفعل."
            : "This email is already registered.",
          REGISTRATION_CLOSED: ar
            ? "إنشاء الحسابات الجديدة متوقف حالياً."
            : "New account registration is currently closed.",
          RATE_LIMITED: ar
            ? "محاولات كثيرة. انتظر قليلاً ثم حاول مجدداً."
            : "Too many attempts. Wait briefly and try again.",
          VALIDATION_ERROR: ar
            ? "تحقق من البيانات المدخلة."
            : "Please check the entered information.",
          NETWORK: ar
            ? "تعذر الاتصال بالخادم."
            : "Could not connect to the server.",
          UNKNOWN: ar ? "تعذر إنشاء الحساب." : "Account creation failed.",
        },
      }}
    />
  );
}
