import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icons";
import type { Locale } from "@/types/i18n";
import type { getAccountOverview } from "@/services/account/account-overview-service";

type AccountOverviewData = Awaited<ReturnType<typeof getAccountOverview>>;

function formatDate(value: Date | string | null | undefined, locale: Locale) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function countTotal(overview: AccountOverviewData) {
  return (
    overview.projects.length +
    overview.organizations.length +
    overview.services.marketListings.length +
    overview.services.marketingCampaigns.length +
    overview.services.jobPostings.length +
    overview.requests.marketInquiries.length +
    overview.requests.jobApplications.length +
    overview.learning.length
  );
}

export function AccountOverview({
  locale,
  overview,
}: {
  locale: Locale;
  overview: AccountOverviewData;
}) {
  const ar = locale === "ar";
  const cards: Array<{
    icon: IconName;
    label: string;
    value: number;
    href: string;
  }> = [
    {
      icon: "briefcase",
      label: ar ? "المشاريع" : "Projects",
      value: overview.projects.length,
      href: "/projects",
    },
    {
      icon: "building",
      label: ar ? "المنشآت" : "Organizations",
      value: overview.organizations.length,
      href: "/programs",
    },
    {
      icon: "activity",
      label: ar ? "الطلبات" : "Requests",
      value:
        overview.requests.marketInquiries.length +
        overview.requests.jobApplications.length,
      href: "/market",
    },
    {
      icon: "graduation",
      label: ar ? "الدورات" : "Courses",
      value: overview.learning.length,
      href: "/academy",
    },
    {
      icon: "grid",
      label: ar ? "الخدمات" : "Services",
      value:
        overview.services.marketListings.length +
        overview.services.marketingCampaigns.length +
        overview.services.jobPostings.length,
      href: "/dashboard",
    },
    {
      icon: "wallet",
      label: ar ? "الملفات" : "Files",
      value: overview.services.fileCount,
      href: "/software",
    },
  ];
  const services = [
    {
      label: ar ? "إعلانات السوق" : "Market listings",
      value: overview.services.marketListings.length,
      href: "/market",
    },
    {
      label: ar ? "الحملات" : "Campaigns",
      value: overview.services.marketingCampaigns.length,
      href: "/marketing",
    },
    {
      label: ar ? "فرص العمل" : "Job postings",
      value: overview.services.jobPostings.length,
      href: "/talent",
    },
    {
      label: ar ? "الملفات" : "Files",
      value: overview.services.fileCount,
      href: "/studio",
    },
  ];
  const recentActivity = [
    ...overview.projects.map((item) => ({
      id: `project-${item.id}`,
      title: item.name,
      type: ar ? "مشروع" : "Project",
      date: item.updatedAt,
      href: "/projects",
    })),
    ...overview.requests.marketInquiries.map((item) => ({
      id: `market-${item.id}`,
      title: item.listing.title,
      type: ar ? "طلب سوق" : "Market inquiry",
      date: item.createdAt,
      href: "/market",
    })),
    ...overview.requests.jobApplications.map((item) => ({
      id: `job-${item.id}`,
      title: item.jobPosting.title,
      type: ar ? "تقديم وظيفة" : "Job application",
      date: item.createdAt,
      href: "/talent",
    })),
    ...overview.services.marketListings.map((item) => ({
      id: `listing-${item.id}`,
      title: item.title,
      type: ar ? "إدراج سوق" : "Market listing",
      date: item.updatedAt,
      href: "/market",
    })),
    ...overview.services.marketingCampaigns.map((item) => ({
      id: `campaign-${item.id}`,
      title: item.name,
      type: ar ? "حملة" : "Campaign",
      date: item.updatedAt,
      href: "/marketing",
    })),
  ]
    .sort(
      (first, second) =>
        new Date(second.date).getTime() - new Date(first.date).getTime(),
    )
    .slice(0, 5);

  return (
    <section
      className="account-overview"
      aria-label={ar ? "ملخص الحساب" : "Account overview"}
    >
      <header className="account-overview__header">
        <div>
          <span className="eyebrow eyebrow--small">
            {ar ? "مركز المستخدم الشخصي" : "PERSONAL USER CENTER"}
          </span>
          <h1>
            {ar ? "حسابي ومركز أعمالي" : "My account and business center"}
          </h1>
          <p>
            {ar
              ? "ملخص موحد للحساب وبيانات الاستثمار والخدمات والنشاط الفعلي."
              : "A unified summary of your account, investment data, services, and real activity."}
          </p>
          <span className="account-overview__scope">
            <Icon name="shield" />
            {ar ? "بيانات خاصة بهذا الحساب" : "Data scoped to this account"}
          </span>
          <Link className="account-overview__customize" href="/user/interface">
            <Icon name="settings" />
            {ar ? "تخصيص الأقسام والخدمات" : "Customize sections and services"}
          </Link>
        </div>
        <strong>
          <span>{countTotal(overview)}</span>
          <small>{ar ? "سجل مرتبط" : "linked records"}</small>
        </strong>
      </header>

      <div className="account-overview__metrics">
        {cards.map((card) => (
          <Link href={card.href} key={card.label}>
            <span className="account-overview__metric-icon">
              <Icon name={card.icon} />
            </span>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </Link>
        ))}
      </div>

      <div className="account-overview__grid">
        <section className="account-overview__account">
          <header>
            <span className="user-investments__panel-icon">
              <Icon name="user" />
            </span>
            <div>
              <h2>{ar ? "الحساب" : "Account"}</h2>
              <p>
                {ar
                  ? "المنشآت والاشتراكات والوصول"
                  : "Organizations, subscriptions, and access"}
              </p>
            </div>
          </header>
          <div className="account-overview__records">
            {overview.organizations.map((organization) => (
              <article key={organization.id}>
                <strong>{organization.name}</strong>
                <span>
                  {organization.isOwner
                    ? ar
                      ? "مالك"
                      : "Owner"
                    : (organization.role ?? (ar ? "عضو" : "Member"))}
                </span>
                <small>
                  {organization.subscriptions.length
                    ? organization.subscriptions
                        .map(
                          (subscription) =>
                            `${subscription.status} ${formatDate(subscription.currentEnd, locale)}`,
                        )
                        .join(" · ")
                    : ar
                      ? "لا توجد اشتراكات"
                      : "No subscriptions"}
                </small>
              </article>
            ))}
            {!overview.organizations.length ? (
              <div className="account-overview__empty">
                <Icon name="building" />
                <span>
                  {ar ? "لا توجد منشآت مرتبطة" : "No linked organizations"}
                </span>
              </div>
            ) : null}
          </div>
          <div className="account-overview__access">
            <span>{ar ? "وصول المجتمع" : "Community access"}</span>
            <strong>
              {overview.communityAccess.hasAccess
                ? ar
                  ? "مفعل"
                  : "Active"
                : ar
                  ? "غير مفعل"
                  : "Inactive"}
            </strong>
            <Link href="/user/unlocks">{ar ? "إدارة" : "Manage"}</Link>
          </div>
        </section>

        <section className="account-overview__investment">
          <header>
            <span className="user-investments__panel-icon">
              <Icon name="pieChart" />
            </span>
            <div>
              <h2>{ar ? "الاستثمارات" : "Investments"}</h2>
              <p>
                {ar
                  ? "المحفظة والعائد والقيمة"
                  : "Portfolio, return, and value"}
              </p>
            </div>
          </header>
          <div className="account-overview__feature-empty">
            <Icon name="lock" />
            <strong>
              {ar
                ? "مصدر الاستثمار غير متصل"
                : "Investment source not connected"}
            </strong>
            <span>
              {ar
                ? "لن تظهر قيم تقديرية على أنها بيانات فعلية."
                : "Estimated values are never shown as real data."}
            </span>
            <Link className="button button--ghost" href="/user/investments">
              {ar ? "فتح بياناتي الاستثمارية" : "Open investment data"}
            </Link>
          </div>
        </section>

        <section className="account-overview__services">
          <header>
            <span className="user-investments__panel-icon">
              <Icon name="grid" />
            </span>
            <div>
              <h2>{ar ? "الخدمات المفتوحة" : "Open services"}</h2>
              <p>
                {ar
                  ? "مساحات العمل المرتبطة بالحساب"
                  : "Workspaces linked to this account"}
              </p>
            </div>
          </header>
          <div className="account-overview__service-list">
            {services.map((service) => (
              <Link href={service.href} key={service.label}>
                <span>{service.label}</span>
                <strong>{service.value}</strong>
                <Icon name="arrow" />
              </Link>
            ))}
          </div>
        </section>

        <section className="account-overview__notifications">
          <header>
            <span className="user-investments__panel-icon">
              <Icon name="bell" />
            </span>
            <div>
              <h2>{ar ? "الإشعارات" : "Notifications"}</h2>
              <p>{ar ? "تنبيهات الحساب الموثقة" : "Verified account alerts"}</p>
            </div>
          </header>
          <div className="account-overview__feature-empty">
            <Icon name="bell" />
            <strong>
              {ar ? "لا توجد إشعارات متاحة" : "No notifications available"}
            </strong>
            <span>
              {ar
                ? "لا يوجد مصدر إشعارات متصل بهذه الواجهة حالياً."
                : "No notification source is currently connected to this view."}
            </span>
          </div>
        </section>

        <section className="account-overview__activity">
          <header>
            <span className="user-investments__panel-icon">
              <Icon name="activity" />
            </span>
            <div>
              <h2>{ar ? "النشاط" : "Activity"}</h2>
              <p>
                {ar
                  ? "آخر السجلات المرتبطة بحسابك"
                  : "Latest records linked to your account"}
              </p>
            </div>
            <Link href="/user/reports">
              {ar ? "كل التقارير" : "All reports"}
            </Link>
          </header>
          <div className="account-overview__activity-list">
            {recentActivity.map((item) => (
              <Link href={item.href} key={item.id}>
                <span className="account-overview__activity-dot" />
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.type}</span>
                </div>
                <small>{formatDate(item.date, locale)}</small>
              </Link>
            ))}
            {!recentActivity.length ? (
              <div className="account-overview__empty">
                <Icon name="activity" />
                <span>
                  {ar ? "لا توجد سجلات نشاط بعد" : "No activity records yet"}
                </span>
              </div>
            ) : null}
          </div>
        </section>

        <section className="account-overview__projects">
          <header>
            <span className="user-investments__panel-icon">
              <Icon name="briefcase" />
            </span>
            <div>
              <h2>{ar ? "مشاريعي" : "My projects"}</h2>
              <p>
                {ar
                  ? "المشاريع والحالة الحالية"
                  : "Projects and current status"}
              </p>
            </div>
          </header>
          <div className="account-overview__records">
            {overview.projects.map((project) => (
              <article key={project.id}>
                <strong>{project.name}</strong>
                <span>
                  {project.status} · {project.currentPhase}
                </span>
                <small>{formatDate(project.updatedAt, locale)}</small>
              </article>
            ))}
            {!overview.projects.length ? (
              <div className="account-overview__empty">
                <Icon name="briefcase" />
                <span>{ar ? "لا توجد مشاريع بعد" : "No projects yet"}</span>
              </div>
            ) : null}
          </div>
        </section>

        <section className="account-overview__learning">
          <header>
            <span className="user-investments__panel-icon">
              <Icon name="graduation" />
            </span>
            <div>
              <h2>{ar ? "تعلمي ودوراتي" : "Learning and courses"}</h2>
              <p>
                {ar
                  ? "المسارات المسجلة والتقدم"
                  : "Enrolled paths and progress"}
              </p>
            </div>
          </header>
          <div className="account-overview__records">
            {overview.learning.map((course) => (
              <article key={course.id}>
                <strong>{course.course.title}</strong>
                <span>{course.status}</span>
                <small>
                  {course.course.completedLessons}/{course.course.totalLessons}{" "}
                  {ar ? "دروس" : "lessons"}
                </small>
              </article>
            ))}
            {!overview.learning.length ? (
              <div className="account-overview__empty">
                <Icon name="graduation" />
                <span>{ar ? "لم تسجل في دورات بعد" : "No courses yet"}</span>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}
