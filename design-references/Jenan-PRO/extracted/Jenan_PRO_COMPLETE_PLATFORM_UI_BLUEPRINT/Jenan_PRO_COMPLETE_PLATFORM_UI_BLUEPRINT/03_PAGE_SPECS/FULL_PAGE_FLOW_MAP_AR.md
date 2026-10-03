# Jenan PRO — Complete Page & Flow Map

إجمالي الشاشات المعرفة: **159**

## الدخول والتسجيل

- `/auth` — **بوابة الدخول** — landing
  - يفتح إلى: /auth/login, /auth/register
- `/auth/login` — **تسجيل الدخول** — form
  - يفتح إلى: /home
- `/auth/register` — **إنشاء حساب** — form
  - يفتح إلى: /user/onboarding
- `/auth/forgot` — **استعادة كلمة المرور** — form
  - يفتح إلى: /auth/login
- `/user/onboarding` — **تهيئة الحساب** — wizard
  - يفتح إلى: /home

## الرئيسية

- `/home` — **الصفحة الرئيسية** — dashboard
  - يفتح إلى: /projects, /academy, /market, /studio, /software, /talent, /marketing, /funding
  - المخرجات: روابط جميع الأقسام

## صفحة المستخدم

- `/user` — **لوحة المستخدم** — dashboard
  - يفتح إلى: /user/investments, /user/unlocks, /user/payments, /user/reports
  - المخرجات: ملخصات
- `/user/investments` — **بياناتي الاستثمارية** — dashboard
  - يفتح إلى: /user/investment/detail, /reports/view/portfolio
  - المخرجات: تقرير المحفظة
- `/user/investment/detail` — **تفاصيل استثمار** — detail
  - يفتح إلى: /reports/view/investment
  - المخرجات: تقرير الاستثمار
- `/user/unlocks` — **اشترك وافتح الخدمات** — dashboard
  - يفتح إلى: /academy, /talent, /studio, /projects/analysis/new
  - المخرجات: حالة الاستحقاق
- `/user/payments` — **المدفوعات والفواتير** — list
  - يفتح إلى: /user/payments/invoice
  - المخرجات: فاتورة PDF, إيصال
- `/user/payments/invoice` — **تفاصيل فاتورة** — report
  - المخرجات: PDF, طباعة
- `/user/reports` — **تقاريري** — list
  - يفتح إلى: /reports/view/general
  - المخرجات: PDF/Print/Share

## المشاريع

- `/projects` — **قسم المشاريع** — dashboard
  - يفتح إلى: /projects/analysis/new, /projects/evaluation/new, /projects/start/new, /projects/feasibility
  - المخرجات: تقارير المشاريع

## المشاريع/تحليل مشروع

- `/projects/analysis/new` — **تحليل مشروع — إدخال البيانات** — form
  - يفتح إلى: /projects/analysis/progress
- `/projects/analysis/progress` — **تحليل مشروع — جاري التحليل** — progress
  - يفتح إلى: /projects/analysis/result
- `/projects/analysis/result` — **نتيجة تحليل المشروع** — dashboard
  - يفتح إلى: /projects/analysis/details, /projects/analysis/map, /projects/analysis/recommendations, /projects/analysis/report
  - المخرجات: ملخص التحليل
- `/projects/analysis/details` — **تفاصيل تحليل السوق** — detail
  - المخرجات: جداول ورسوم
- `/projects/analysis/map` — **الخريطة الجغرافية للفرص** — dashboard
  - المخرجات: تقرير جغرافي
- `/projects/analysis/recommendations` — **الرؤى والتوصيات** — detail
  - المخرجات: ملخص تنفيذي
- `/projects/analysis/report` — **تقرير تحليل المشروع** — report
  - يفتح إلى: /reports/print/project-analysis
  - المخرجات: PDF, طباعة, مشاركة, بريد

## المشاريع/تقييم مشروع

- `/projects/evaluation/new` — **تقييم مشروع — إدخال البيانات** — form
  - يفتح إلى: /projects/evaluation/progress
- `/projects/evaluation/progress` — **تقييم مشروع — جاري التقييم** — progress
  - يفتح إلى: /projects/evaluation/result
- `/projects/evaluation/result` — **نتيجة تقييم المشروع** — dashboard
  - يفتح إلى: /projects/evaluation/details, /projects/evaluation/risks, /projects/evaluation/recommendations, /projects/evaluation/report
  - المخرجات: ملخص التقييم
- `/projects/evaluation/details` — **تفاصيل نقاط التقييم** — detail
  - المخرجات: جداول تقييم
- `/projects/evaluation/risks` — **تحليل المخاطر والعائد** — dashboard
  - المخرجات: تقرير مخاطر
- `/projects/evaluation/recommendations` — **التوصيات النهائية** — detail
  - يفتح إلى: /projects/start/new
  - المخرجات: ملخص توصيات
- `/projects/evaluation/report` — **تقرير تقييم المشروع** — report
  - يفتح إلى: /reports/print/project-evaluation
  - المخرجات: PDF, طباعة, مشاركة, بريد

## المشاريع/بدء مشروع

- `/projects/start/new` — **بدء مشروع — بيانات البداية** — form
  - يفتح إلى: /projects/start/roadmap
- `/projects/start/roadmap` — **خارطة تنفيذ المشروع** — timeline
  - يفتح إلى: /projects/start/licenses, /projects/start/setup, /projects/start/team, /projects/start/vendors, /projects/start/launch
  - المخرجات: خارطة زمنية
- `/projects/start/licenses` — **التراخيص والإجراءات** — checklist
  - المخرجات: Checklist
- `/projects/start/setup` — **التجهيز والميزانية** — dashboard
  - المخرجات: ميزانية
- `/projects/start/team` — **الفريق والمهام** — dashboard
  - المخرجات: خطة فريق
- `/projects/start/vendors` — **الموردون والشركاء** — list
  - المخرجات: قائمة موردين
- `/projects/start/launch` — **الإطلاق والنمو** — dashboard
  - يفتح إلى: /projects/start/report
  - المخرجات: خطة إطلاق
- `/projects/start/report` — **تقرير خطة بدء المشروع** — report
  - المخرجات: PDF, طباعة, مشاركة, بريد

## المشاريع/دراسات الجدوى

- `/projects/feasibility` — **اختيار نوع دراسة الجدوى** — landing
  - يفتح إلى: /projects/feasibility/simple/new, /projects/feasibility/pro/new
- `/projects/feasibility/simple/new` — **الدراسة المبسطة — البيانات** — form
  - يفتح إلى: /projects/feasibility/simple/result
- `/projects/feasibility/simple/result` — **نتيجة الدراسة المبسطة** — dashboard
  - يفتح إلى: /projects/feasibility/simple/report, /projects/feasibility/pro/new
  - المخرجات: تقرير مبسط
- `/projects/feasibility/simple/report` — **تقرير الدراسة المبسطة** — report
  - المخرجات: PDF, Print, Share, Email
- `/projects/feasibility/pro/new` — **الدراسة الاحترافية — البداية** — wizard
  - يفتح إلى: /projects/feasibility/pro/market
- `/projects/feasibility/pro/market` — **الدراسة السوقية** — dashboard
  - يفتح إلى: /projects/feasibility/pro/financial
  - المخرجات: جداول ورسوم
- `/projects/feasibility/pro/financial` — **الدراسة المالية** — dashboard
  - يفتح إلى: /projects/feasibility/pro/technical
  - المخرجات: جداول مالية
- `/projects/feasibility/pro/technical` — **الدراسة الفنية والتقنية** — detail
  - يفتح إلى: /projects/feasibility/pro/operational
  - المخرجات: قائمة متطلبات
- `/projects/feasibility/pro/operational` — **الدراسة التشغيلية** — detail
  - يفتح إلى: /projects/feasibility/pro/swot
  - المخرجات: خطة تشغيل
- `/projects/feasibility/pro/swot` — **SWOT والمخاطر والحساسية** — dashboard
  - يفتح إلى: /projects/feasibility/pro/timeline
  - المخرجات: تحليل سيناريوهات
- `/projects/feasibility/pro/timeline` — **الجدول الزمني والتنفيذ** — timeline
  - يفتح إلى: /projects/feasibility/pro/result
  - المخرجات: Timeline
- `/projects/feasibility/pro/result` — **النتيجة الاحترافية** — dashboard
  - يفتح إلى: /projects/feasibility/pro/report
  - المخرجات: Executive Summary
- `/projects/feasibility/pro/report` — **تقرير الدراسة الاحترافية** — report
  - المخرجات: PDF, Word, Excel, PowerPoint عند دعمها, Print, Share, Email

## الأكاديمية

- `/academy` — **أكاديمية جنان** — dashboard
  - يفتح إلى: /academy/courses, /academy/webinars, /academy/studies, /academy/research, /academy/paths
  - المخرجات: شهادات, تقارير تعلم
- `/academy/courses` — **الدورات** — list
  - يفتح إلى: /academy/course/sample
- `/academy/course/sample` — **تفاصيل الدورة** — detail
  - يفتح إلى: /academy/course/sample/lesson/1
  - المخرجات: خطة الدورة
- `/academy/course/sample/lesson/1` — **مشغل الدرس** — player
  - يفتح إلى: /academy/course/sample/quiz
  - المخرجات: ملخص الدرس
- `/academy/course/sample/quiz` — **اختبار الدورة** — form
  - يفتح إلى: /academy/course/sample/result
  - المخرجات: النتيجة
- `/academy/course/sample/result` — **نتيجة الدورة** — dashboard
  - يفتح إلى: /academy/certificates/sample
  - المخرجات: شهادة
- `/academy/webinars` — **الندوات** — list
  - يفتح إلى: /academy/webinar/sample
- `/academy/webinar/sample` — **تفاصيل الندوة** — detail
  - يفتح إلى: /academy/webinar/sample/live
- `/academy/webinar/sample/live` — **الندوة المباشرة** — live
  - المخرجات: تسجيل/ملخص
- `/academy/studies` — **الدراسات** — list
  - يفتح إلى: /academy/study/sample
- `/academy/study/sample` — **تفاصيل دراسة** — reader
  - المخرجات: PDF عند التوفر
- `/academy/research` — **الأبحاث** — list
  - يفتح إلى: /academy/research/sample
- `/academy/research/sample` — **تفاصيل بحث** — reader
  - المخرجات: PDF/Reference
- `/academy/paths` — **المسارات التعليمية** — list
  - يفتح إلى: /academy/path/sample
- `/academy/path/sample` — **تفاصيل المسار** — timeline
  - المخرجات: خطة تعلم
- `/academy/certificates/sample` — **شهادة إتمام** — report
  - المخرجات: PDF, Print, Share

## سوق جنان

- `/market` — **سوق جنان** — dashboard
  - يفتح إلى: /market/listings, /market/sell
  - المخرجات: ملخصات السوق
- `/market/listings` — **قائمة العروض** — list
  - يفتح إلى: /market/listing/sample
- `/market/listing/sample` — **تفاصيل إعلان/فرصة** — detail
  - يفتح إلى: /market/nda/sample, /market/viewing/sample, /market/offer/sample
  - المخرجات: ملخص فرصة
- `/market/nda/sample` — **اتفاقية السرية** — form
  - يفتح إلى: /market/listing/sample/secure
  - المخرجات: نسخة الاتفاقية
- `/market/listing/sample/secure` — **التفاصيل المحمية** — detail
  - المخرجات: ملف فحص أولي
- `/market/viewing/sample` — **حجز المعاينة** — form
  - يفتح إلى: /market/deal/sample
  - المخرجات: تأكيد موعد
- `/market/offer/sample` — **تقديم عرض شراء** — form
  - يفتح إلى: /market/deal/sample
  - المخرجات: عرض شراء
- `/market/deal/sample` — **مسار الصفقة** — timeline
  - يفتح إلى: /market/deal/sample/report
  - المخرجات: سجل الصفقة
- `/market/deal/sample/report` — **تقرير الصفقة** — report
  - المخرجات: PDF, Print, Share
- `/market/sell` — **إنشاء إعلان بيع** — wizard
  - يفتح إلى: /market/sell/media
- `/market/sell/media` — **صور ومستندات الإعلان** — form
  - يفتح إلى: /market/sell/review
- `/market/sell/review` — **مراجعة ونشر الإعلان** — detail
  - المخرجات: نسخة الإعلان

## البرمجيات والأدوات

- `/studio` — **برمجيات وأدوات Jenan PRO** — dashboard
  - يفتح إلى: /studio/pdf, /studio/docs, /studio/sheets, /studio/presentations, /studio/logo, /studio/cv
  - المخرجات: ملفات ومخرجات
- `/studio/pdf` — **Jenan PDF** — tool
  - يفتح إلى: /studio/pdf/editor
  - المخرجات: PDF
- `/studio/pdf/editor` — **محرر PDF** — editor
  - المخرجات: PDF
- `/studio/docs` — **Jenan Docs** — editor
  - المخرجات: DOCX, PDF
- `/studio/sheets` — **Jenan Sheets** — editor
  - المخرجات: XLSX, CSV, PDF
- `/studio/presentations` — **Jenan Presentations** — editor
  - المخرجات: PPTX عند الدعم, PDF
- `/studio/logo` — **مصمم الشعار والهوية** — wizard
  - المخرجات: PNG/SVG/PDF عند الدعم
- `/studio/letterhead` — **تصميم الورق الرسمي** — editor
  - المخرجات: PDF/DOCX عند الدعم
- `/studio/cv` — **منشئ السيرة الذاتية** — wizard
  - المخرجات: PDF
- `/studio/history` — **سجل الملفات** — list
  - المخرجات: إصدارات

## Jenan Software

- `/software` — **Jenan Software** — dashboard
  - يفتح إلى: /software/sales, /software/accounting, /software/hr, /software/inventory, /software/crm
  - المخرجات: تقارير تشغيلية
- `/software/accounting` — **المحاسبة** — dashboard
  - المخرجات: P&L, Balance Sheet, Cash Flow
- `/software/inventory` — **المخزون** — dashboard
  - المخرجات: تقارير/تصدير
- `/software/crm` — **CRM** — dashboard
  - المخرجات: تقارير/تصدير
- `/software/projects` — **إدارة المشاريع التشغيلية** — dashboard
  - المخرجات: تقارير/تصدير
- `/software/pos` — **نقاط البيع** — dashboard
  - المخرجات: تقارير/تصدير
- `/software/purchases` — **المشتريات** — dashboard
  - المخرجات: تقارير/تصدير
- `/software/company` — **إدارة الشركات** — dashboard
  - المخرجات: تقارير/تصدير
- `/software/reports` — **التقارير الموحدة** — dashboard
  - المخرجات: تقارير/تصدير

## Jenan Software/Sales

- `/software/sales` — **Jenan Sales** — dashboard
  - يفتح إلى: /software/sales/customers, /software/sales/quotes, /software/sales/invoices
  - المخرجات: Sales Reports
- `/software/sales/customers` — **العملاء** — list
  - المخرجات: تقرير/تصدير
- `/software/sales/quotes` — **عروض الأسعار** — list
  - المخرجات: تقرير/تصدير
- `/software/sales/orders` — **أوامر البيع** — list
  - المخرجات: تقرير/تصدير
- `/software/sales/invoices` — **فواتير المبيعات** — list
  - المخرجات: تقرير/تصدير
- `/software/sales/receipts` — **سندات القبض** — list
  - المخرجات: تقرير/تصدير
- `/software/sales/products` — **المنتجات** — list
  - المخرجات: تقرير/تصدير
- `/software/sales/returns` — **المرتجعات** — list
  - المخرجات: تقرير/تصدير
- `/software/sales/reports` — **تقارير المبيعات** — dashboard
  - المخرجات: PDF/Excel

## Jenan Software/HR

- `/software/hr` — **Jenan HR** — dashboard
  - يفتح إلى: /software/hr/employees, /software/hr/attendance, /software/hr/payroll
  - المخرجات: HR Reports
- `/software/hr/employees` — **الموظفون** — list
  - المخرجات: تقرير
- `/software/hr/attendance` — **الحضور والانصراف** — list
  - المخرجات: تقرير
- `/software/hr/leave` — **الإجازات** — list
  - المخرجات: تقرير
- `/software/hr/payroll` — **الرواتب** — list
  - المخرجات: تقرير
- `/software/hr/performance` — **الأداء** — list
  - المخرجات: تقرير

## الوظائف والمواهب

- `/talent` — **الوظائف والمواهب** — dashboard
  - يفتح إلى: /talent/jobs, /talent/employer
  - المخرجات: تقارير
- `/talent/jobs` — **البحث عن وظائف** — list
  - يفتح إلى: /talent/job/sample
- `/talent/job/sample` — **تفاصيل الوظيفة** — detail
  - يفتح إلى: /talent/apply/sample
- `/talent/apply/sample` — **التقديم على وظيفة** — form
  - المخرجات: طلب توظيف
- `/talent/profile` — **ملف الباحث عن عمل** — detail
  - المخرجات: CV
- `/talent/employer` — **لوحة صاحب العمل** — dashboard
  - يفتح إلى: /talent/employer/post, /talent/employer/applicants
  - المخرجات: Hiring Report
- `/talent/employer/post` — **نشر وظيفة** — form
- `/talent/employer/applicants` — **إدارة المتقدمين** — list
  - يفتح إلى: /talent/candidate/sample
  - المخرجات: Applicant Report
- `/talent/candidate/sample` — **ملف المرشح** — detail
  - المخرجات: Candidate Summary
- `/talent/search` — **البحث في المواهب** — list
- `/talent/matching` — **المطابقة الذكية** — dashboard
  - المخرجات: Matching Report
- `/talent/reports` — **تقارير التوظيف** — dashboard
  - المخرجات: PDF/Excel

## التسويق والإعلانات

- `/marketing` — **التسويق والإعلانات** — dashboard
  - يفتح إلى: /marketing/campaign/new
  - المخرجات: Marketing Reports
- `/marketing/campaigns` — **الحملات** — list
  - يفتح إلى: /marketing/campaign/sample
  - المخرجات: Campaign Report
- `/marketing/campaign/new` — **إنشاء حملة** — wizard
  - يفتح إلى: /marketing/campaign/sample
- `/marketing/campaign/sample` — **تفاصيل الحملة** — dashboard
  - يفتح إلى: /marketing/report/sample
  - المخرجات: Campaign Report
- `/marketing/audience` — **الجمهور** — dashboard
  - المخرجات: Audience Report
- `/marketing/channels` — **القنوات** — dashboard
  - المخرجات: Channel Report
- `/marketing/leads` — **العملاء المحتملون** — list
  - المخرجات: Lead Export
- `/marketing/analytics` — **تحليلات التسويق** — dashboard
  - المخرجات: Analytics Report
- `/marketing/report/sample` — **تقرير الحملة** — report
  - المخرجات: PDF, Print, Share, Email

## أهلية التمويل

- `/funding` — **مركز أهلية التمويل الذكي** — dashboard
  - يفتح إلى: /funding/readiness
  - المخرجات: Readiness Report
- `/funding/readiness` — **تقييم الجاهزية** — form
  - يفتح إلى: /funding/result
- `/funding/result` — **نتيجة الجاهزية** — dashboard
  - يفتح إلى: /funding/company, /funding/opportunities, /funding/report
  - المخرجات: Readiness Summary
- `/funding/company` — **ملف المنشأة** — detail
  - المخرجات: Company File
- `/funding/opportunities` — **فرص تمويل محتملة** — list
  - المخرجات: Opportunity List
- `/funding/advisor` — **Jenan AI Advisor** — detail
  - المخرجات: Advice Summary
- `/funding/report` — **تقرير أهلية التمويل** — report
  - المخرجات: PDF, Print, Share, Email

## Jenan Robotics

- `/robotics` — **Jenan Robotics — الروبوتات الذكية** — dashboard
  - يفتح إلى: /robotics/search
  - المخرجات: Recommendations
- `/robotics/search` — **البحث عن روبوت** — form
  - يفتح إلى: /robotics/results
  - المخرجات: Matching
- `/robotics/results` — **نتائج الروبوتات** — list
  - يفتح إلى: /robotics/item/sample
- `/robotics/item/sample` — **تفاصيل روبوت** — detail
  - المخرجات: Specification Sheet
- `/robotics/recommendations` — **التوصيات** — dashboard
  - المخرجات: Recommendation Report

## الأدمن

- `/admin` — **لوحة تحكم الأدمن** — dashboard
  - يفتح إلى: /admin/users, /admin/subscriptions, /admin/finance, /admin/health
  - المخرجات: Admin Reports
- `/admin/users` — **المستخدمون** — list
  - المخرجات: تقارير/تصدير
- `/admin/subscriptions` — **الاشتراكات** — list
  - المخرجات: تقارير/تصدير
- `/admin/services` — **الخدمات والأقسام** — dashboard
  - المخرجات: تقارير/تصدير
- `/admin/finance` — **الإيرادات والتكاليف** — dashboard
  - المخرجات: تقارير/تصدير
- `/admin/ai` — **تكاليف الذكاء والنماذج** — dashboard
  - المخرجات: تقارير/تصدير
- `/admin/agents` — **الوكلاء والروبوتات** — dashboard
  - المخرجات: تقارير/تصدير
- `/admin/audit` — **سجل التدقيق** — list
  - المخرجات: تقارير/تصدير
- `/admin/health` — **صحة النظام** — dashboard
  - المخرجات: تقارير/تصدير
- `/admin/reports` — **تقارير الأدمن** — dashboard
  - المخرجات: تقارير/تصدير

## المخرجات المشتركة

- `/reports/view/general` — **عارض التقرير** — report
  - المخرجات: PDF, Print, Share, Email
- `/reports/print/project-analysis` — **طباعة تقرير تحليل المشروع** — report
  - المخرجات: PDF, Print, Share, Email
- `/reports/print/project-evaluation` — **طباعة تقرير تقييم المشروع** — report
  - المخرجات: PDF, Print, Share, Email
- `/reports/view/portfolio` — **تقرير المحفظة الاستثمارية** — report
  - المخرجات: PDF, Print, Share, Email
- `/reports/view/investment` — **تقرير استثمار** — report
  - المخرجات: PDF, Print, Share, Email
