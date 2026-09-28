import Link from "next/link";
import { notFound } from "next/navigation";

import { getRequestDictionary } from "@/lib/i18n/server";
import { getLearnerCertificateVerification } from "@/services/academy/learner-progress-service";

export default async function AcademyCertificateVerificationPage({ params }: { params: Promise<{ certificateId: string }> }) {
  const [{ certificateId }, { locale }] = await Promise.all([params, getRequestDictionary()]);
  const certificate = await getLearnerCertificateVerification(certificateId);
  if (!certificate) notFound();
  const ar = locale === "ar";

  return <main className="academy-verification" data-certificate-state={certificate.valid ? "VALID" : certificate.expired ? "EXPIRED" : certificate.status} data-certificate-verification={certificate.id} dir={ar ? "rtl" : "ltr"}>
    <header><Link href="/" aria-label={ar ? "Jenan PRO الرئيسية" : "Jenan PRO home"}>Jenan <b>PRO</b></Link><span>{ar ? "بوابة التحقق الأكاديمي" : "Academic Verification Gateway"}</span></header>
    <article><div className="academy-verification__seal" aria-hidden="true">J</div><span>{certificate.valid ? (ar ? "شهادة صالحة" : "VALID CERTIFICATE") : certificate.expired ? (ar ? "منتهية" : "EXPIRED") : certificate.status}</span><h1>{certificate.certification?.name ?? (ar ? "شهادة إتمام معتمدة" : "Certified course completion")}</h1><p>{certificate.course.title}</p><dl><div><dt>{ar ? "المتعلم" : "Learner"}</dt><dd>{certificate.user.profile?.displayName ?? (ar ? "اسم غير منشور" : "Name not published")}</dd></div><div><dt>{ar ? "رمز الدورة" : "Course code"}</dt><dd>{certificate.course.code}</dd></div><div><dt>{ar ? "تاريخ الإصدار" : "Awarded"}</dt><dd>{new Intl.DateTimeFormat(ar ? "ar-SA" : "en-GB", { dateStyle: "long" }).format(certificate.awardedAt)}</dd></div><div><dt>{ar ? "تاريخ الانتهاء" : "Expires"}</dt><dd>{certificate.expiresAt ? new Intl.DateTimeFormat(ar ? "ar-SA" : "en-GB", { dateStyle: "long" }).format(certificate.expiresAt) : (ar ? "لا تنتهي" : "No expiry")}</dd></div><div><dt>{ar ? "رمز التحقق" : "Verification ID"}</dt><dd>{certificate.id}</dd></div></dl><small>{ar ? "تم التحقق مباشرة من سجل Jenan PRO الأكاديمي. لا يعرض هذا الرابط البريد الإلكتروني أو بيانات الحساب الخاصة." : "Verified directly against the Jenan PRO academic registry. This link does not disclose email or private account data."}</small></article>
  </main>;
}