import { AuthAccessPage } from "@/components/auth/auth-access-page";
import { getRequestDictionary } from "@/lib/i18n/server";

export default async function RegisterPage() {
  const { locale } = await getRequestDictionary();
  const ar = locale === "ar";
  return (
    <AuthAccessPage
      locale={locale}
      mode="register"
      languageLabel={ar ? "التبديل إلى الإنجليزية" : "Switch to Arabic"}
      labels={{
          name: ar ? "الاسم الكامل" : "Full name",
          countryCode: ar ? "رمز الدولة" : "Country code",
          email: ar ? "البريد الإلكتروني" : "Email address",
          password: ar ? "كلمة المرور" : "Password",
          submit: ar ? "إنشاء الحساب" : "Create account",
          remember: "",
          forgot: "",
          loading: ar ? "جارٍ إنشاء الحساب..." : "Creating account...",
          note: ar ? "كلمة المرور 12 حرفًا على الأقل" : "Password must contain at least 12 characters",
          errors: {
            DUPLICATE_EMAIL: ar ? "البريد الإلكتروني مستخدم بالفعل." : "This email is already registered.",
            VALIDATION_ERROR: ar ? "تحقق من البيانات المدخلة." : "Please check the entered information.",
            NETWORK: ar ? "تعذر الاتصال بالخادم." : "Could not connect to the server.",
            UNKNOWN: ar ? "تعذر إنشاء الحساب." : "Account creation failed.",
          },
      }}
    />
  );
}
