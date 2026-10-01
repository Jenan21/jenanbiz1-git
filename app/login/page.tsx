import { CanonicalAuthAccessPage } from "@/components/auth/canonical-auth-access-page";
import { getRequestDictionary } from "@/lib/i18n/server";
import { readPlatformCatalog } from "@/lib/platform/catalog";

export default async function LoginPage() {
  const [{ locale }, catalog] = await Promise.all([
    getRequestDictionary(),
    readPlatformCatalog(),
  ]);
  const ar = locale === "ar";
  return (
    <CanonicalAuthAccessPage
      locale={locale}
      mode="login"
      modules={catalog.modules.filter((module) => module.id !== "dashboard")}
      labels={{
        name: "",
        countryCode: "",
        email: ar ? "البريد الإلكتروني" : "Email address",
        password: ar ? "كلمة المرور" : "Password",
        submit: ar ? "تسجيل الدخول" : "Sign in",
        remember: ar ? "تذكرني" : "Remember me",
        forgot: ar ? "نسيت كلمة المرور؟" : "Forgot password?",
        loading: ar ? "جارٍ التحقق..." : "Verifying...",
        note: ar
          ? "اتصال مشفر وجلسة آمنة"
          : "Encrypted connection and secure session",
        errors: {
          INVALID_CREDENTIALS: ar
            ? "البريد الإلكتروني أو كلمة المرور غير صحيحة."
            : "Invalid email or password.",
          ACCOUNT_DISABLED: ar
            ? "الحساب غير متاح حاليًا."
            : "This account is currently unavailable.",
          VALIDATION_ERROR: ar
            ? "تحقق من البيانات المدخلة."
            : "Please check the entered information.",
          RATE_LIMITED: ar
            ? "محاولات كثيرة. انتظر قليلاً ثم حاول مجدداً."
            : "Too many attempts. Wait briefly and try again.",
          NETWORK: ar
            ? "تعذر الاتصال بالخادم."
            : "Could not connect to the server.",
          UNKNOWN: ar ? "تعذر تسجيل الدخول." : "Sign in failed.",
        },
      }}
    />
  );
}
