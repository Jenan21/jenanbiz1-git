import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { getRequestDictionary } from "@/lib/i18n/server";

export default async function RegisterPage() {
  const { locale } = await getRequestDictionary();
  const ar = locale === "ar";
  return (
    <AuthShell
      locale={locale}
      languageLabel={ar ? "التبديل إلى الإنجليزية" : "Switch to Arabic"}
      eyebrow={ar ? "ابدأ رحلتك" : "Start your journey"}
      title={
        ar
          ? "أنشئ حساب أعمالك بثقة"
          : "Create your business account with confidence"
      }
      subtitle={
        ar
          ? "تجربة تسجيل مهيأة للإطلاق العالمي مع هوية واضحة وأمان متدرج."
          : "A launch-ready registration flow with clear identity and layered security."
      }
      alternateText={ar ? "لديك حساب بالفعل؟" : "Already have an account?"}
      alternateLabel={ar ? "تسجيل الدخول" : "Sign in"}
      alternateHref="/login"
    >
      <AuthForm
        mode="register"
        locale={locale}
        labels={{
          name: ar ? "الاسم الكامل" : "Full name",
          email: ar ? "البريد الإلكتروني" : "Email address",
          password: ar ? "كلمة المرور" : "Password",
          countryCode: ar ? "رمز الدولة" : "Country code",
          submit: ar ? "إنشاء الحساب" : "Create account",
          loading: ar ? "جارٍ إنشاء الحساب..." : "Creating account...",
          remember: "",
          forgot: "",
          note: ar
            ? "كلمة المرور 12 حرفًا على الأقل"
            : "Password must contain at least 12 characters",
          errors: {
            DUPLICATE_EMAIL: ar
              ? "البريد الإلكتروني مستخدم بالفعل."
              : "This email is already registered.",
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
    </AuthShell>
  );
}
