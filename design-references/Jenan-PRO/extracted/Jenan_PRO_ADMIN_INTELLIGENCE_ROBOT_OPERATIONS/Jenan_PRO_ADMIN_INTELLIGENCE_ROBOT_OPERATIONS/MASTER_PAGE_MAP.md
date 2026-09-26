# Jenan PRO — Admin Intelligence & Robot Operations

إجمالي الواجهات: **80**

## 00 — مركز قيادة الأدمن

- `/admin` — **مركز قيادة Jenan PRO** — command
- `/admin/operations` — **مركز العمليات الحي** — command
- `/admin/users` — **إدارة المستخدمين** — list
- `/admin/subscriptions` — **الاشتراكات والخطط** — list
- `/admin/services` — **الخدمات والأقسام** — matrix
- `/admin/rbac` — **الأدوار والصلاحيات RBAC** — matrix
- `/admin/audit` — **سجل التدقيق** — timeline

## 01 — مصنع الروبوتات

- `/robots/factory` — **مصنع الروبوتات** — factory
- `/robots/factory/create-batch` — **إنشاء دفعة روبوتات** — wizard
- `/robots/factory/batches` — **دفعات مصنع الروبوتات** — list
- `/robots/factory/batches/sample` — **تفاصيل دفعة روبوتات** — detail
- `/robots/factory/genetics` — **قواعد التوليد والاختيار** — network
- `/robots/registry` — **سجل هويات الروبوتات** — registry
- `/robots/profile/sample` — **ملف الروبوت** — profile

## 02 — أكاديمية الروبوتات

- `/robot-academy` — **أكاديمية روبوتات Jenan PRO** — academy
- `/robot-academy/batches` — **دفعات الأكاديمية** — list
- `/robot-academy/batches/sample` — **مسار دفعة داخل الأكاديمية** — timeline
- `/robot-academy/curriculum` — **المناهج والمسارات** — academy
- `/robot-academy/theory` — **الدراسة النظرية** — learning
- `/robot-academy/practical` — **التدريب العملي** — learning
- `/robot-academy/exams` — **مركز الاختبارات** — exam
- `/robot-academy/exams/sample` — **تفاصيل اختبار** — exam
- `/robot-academy/results/sample` — **نتيجة روبوت** — profile
- `/robot-academy/graduation` — **التخرج والتوزيع** — academy
- `/robot-academy/elimination` — **الاستبعاد وإعادة التأهيل** — list
- `/robot-academy/specializations` — **التخصصات والمهارات** — matrix
- `/robot-academy/geography` — **التخصص الجغرافي** — map
- `/robot-academy/reports` — **تقارير الأكاديمية** — report-center

## 03 — الهيكل الإداري للروبوتات

- `/robot-org` — **الهيكل الإداري للروبوتات** — org
- `/robot-org/workers` — **الروبوتات الموظفة** — list
- `/robot-org/supervisors` — **المشرفون** — list
- `/robot-org/managers` — **المديرون** — list
- `/robot-org/supreme-committee` — **اللجنة العليا — 50 روبوت** — committee
- `/robot-org/supreme-committee/review/sample` — **ملف مراجعة اللجنة** — committee
- `/robot-org/escalations` — **مركز التصعيدات** — list

## 04 — مركز المهام

- `/missions` — **Mission Control — مركز المهام** — mission
- `/missions/create` — **إنشاء مهمة** — wizard
- `/missions/queue` — **طابور المهام** — queue
- `/missions/sample` — **تفاصيل المهمة** — mission-detail
- `/missions/sample/dependencies` — **اعتماديات المهمة** — network
- `/missions/sample/retry-fallback` — **Retry & Fallback** — timeline
- `/missions/sample/approvals` — **الموافقات والتصعيد** — timeline
- `/missions/sample/evidence` — **Evidence Pack — حزمة الأدلة** — evidence
- `/missions/sample/cost` — **تكلفة المهمة** — finance
- `/missions/reports` — **تقارير المهام** — report-center

## 05 — مركز الذكاء

- `/intelligence` — **مركز الذكاء** — intelligence
- `/intelligence/knowledge` — **المعرفة المشتركة** — knowledge
- `/intelligence/experiences` — **مكتبة الخبرات** — knowledge
- `/intelligence/learning-logs` — **Learning Logs** — timeline
- `/intelligence/evidence` — **قاعدة الأدلة** — evidence
- `/intelligence/reviews` — **مراجعة واعتماد المعرفة** — committee
- `/intelligence/versions` — **الإصدارات وRollback** — timeline
- `/intelligence/skills` — **سجل المهارات** — matrix

## 06 — النماذج والأدوات

- `/models` — **Model Registry** — registry
- `/models/router` — **Model Router** — network
- `/models/executions` — **Model Executions** — list
- `/tools` — **Tool Registry** — registry
- `/tools/permissions` — **صلاحيات الأدوات** — matrix
- `/tools/executions` — **Tool Executions** — list

## 07 — الإيرادات والتكاليف

- `/finance` — **المركز المالي التشغيلي** — finance
- `/finance/revenue` — **الإيرادات** — finance
- `/finance/costs` — **التكاليف** — finance
- `/finance/ai-costs` — **تكاليف الذكاء** — finance
- `/finance/service-profitability` — **ربحية الخدمات** — matrix
- `/finance/ledger` — **Cost Ledger** — list
- `/finance/reports` — **التقارير المالية التشغيلية** — report-center

## 08 — المراقبة والبنية

- `/observability` — **Observability Center** — command
- `/observability/workers` — **Workers** — queue
- `/observability/queues` — **Queues** — queue
- `/observability/health` — **صحة الأنظمة** — command
- `/observability/logs` — **السجلات** — list
- `/observability/alerts` — **التنبيهات والحوادث** — list
- `/observability/backups` — **النسخ الاحتياطية** — timeline

## 09 — التقارير العليا

- `/admin/reports` — **مركز التقارير العليا** — report-center
- `/admin/reports/robots` — **تقرير أداء الروبوتات** — report
- `/admin/reports/academy` — **تقرير أكاديمية الروبوتات** — report
- `/admin/reports/missions` — **تقرير المهام** — report
- `/admin/reports/intelligence` — **تقرير مركز الذكاء** — report
- `/admin/reports/finance` — **التقرير المالي التشغيلي** — report
- `/admin/reports/system` — **تقرير صحة النظام** — report
