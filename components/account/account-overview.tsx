import Link from "next/link";
import type { Locale } from "@/types/i18n";
import type { getAccountOverview } from "@/services/account/account-overview-service";

type AccountOverviewData = Awaited<ReturnType<typeof getAccountOverview>>;

function formatDate(value: Date | string | null | undefined, locale: Locale) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", { dateStyle: "medium" }).format(new Date(value));
}

function countTotal(overview: AccountOverviewData) {
  return overview.projects.length +
    overview.organizations.length +
    overview.services.marketListings.length +
    overview.services.marketingCampaigns.length +
    overview.services.jobPostings.length +
    overview.requests.marketInquiries.length +
    overview.requests.jobApplications.length +
    overview.learning.length;
}

export function AccountOverview({ locale, overview }: { locale: Locale; overview: AccountOverviewData }) {
  const ar = locale === "ar";
  const cards = [
    { label: ar ? "المشاريع" : "Projects", value: overview.projects.length, href: "/projects" },
    { label: ar ? "المنشآت" : "Organizations", value: overview.organizations.length, href: "/programs" },
    { label: ar ? "الطلبات" : "Requests", value: overview.requests.marketInquiries.length + overview.requests.jobApplications.length, href: "/market" },
    { label: ar ? "الدورات" : "Courses", value: overview.learning.length, href: "/academy" },
    { label: ar ? "الخدمات" : "Services", value: overview.services.marketListings.length + overview.services.marketingCampaigns.length + overview.services.jobPostings.length, href: "/dashboard" },
    { label: ar ? "الملفات" : "Files", value: overview.services.fileCount, href: "/software" },
  ];

  return (
    <section className="account-overview" aria-label={ar ? "ملخص الحساب" : "Account overview"}>
      <header className="account-overview__header">
        <div>
          <span className="eyebrow eyebrow--small">JENAN PRO ACCOUNT</span>
          <h1>{ar ? "حسابي ومركز أعمالي" : "My account and business center"}</h1>
          <p>{ar ? "كل مشاريعك واشتراكاتك وطلباتك وخدماتك ودوراتك في مكان واحد." : "Your projects, subscriptions, requests, services, and courses in one place."}</p>
        </div>
        <strong>{countTotal(overview)}</strong>
      </header>

      <div className="account-overview__metrics">
        {cards.map((card) => (
          <Link href={card.href} key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </Link>
        ))}
      </div>

      <div className="account-overview__grid">
        <section>
          <h2>{ar ? "مشاريعي" : "My projects"}</h2>
          {overview.projects.map((project) => <article key={project.id}><strong>{project.name}</strong><span>{project.status} · {project.currentPhase}</span><small>{formatDate(project.updatedAt, locale)}</small></article>)}
          {!overview.projects.length ? <p>{ar ? "لا توجد مشاريع بعد." : "No projects yet."}</p> : null}
        </section>

        <section>
          <h2>{ar ? "اشتراكاتي ومنشآتي" : "Subscriptions and organizations"}</h2>
          {overview.organizations.map((organization) => <article key={organization.id}><strong>{organization.name}</strong><span>{organization.isOwner ? (ar ? "مالك" : "Owner") : organization.role ?? (ar ? "عضو" : "Member")}</span><small>{organization.subscriptions.length ? organization.subscriptions.map((subscription) => `${subscription.status} ${formatDate(subscription.currentEnd, locale)}`).join(" · ") : (ar ? "لا توجد اشتراكات" : "No subscriptions")}</small></article>)}
          {!overview.organizations.length ? <p>{ar ? "لا توجد منشآت مرتبطة." : "No linked organizations."}</p> : null}
        </section>

        <section>
          <h2>{ar ? "طلباتي" : "My requests"}</h2>
          {overview.requests.marketInquiries.map((request) => <article key={request.id}><strong>{request.listing.title}</strong><span>{ar ? "طلب سوق" : "Market inquiry"} · {request.status}</span><small>{formatDate(request.createdAt, locale)}</small></article>)}
          {overview.requests.jobApplications.map((application) => <article key={application.id}><strong>{application.jobPosting.title}</strong><span>{ar ? "تقديم وظيفة" : "Job application"} · {application.status}</span><small>{formatDate(application.createdAt, locale)}</small></article>)}
          {overview.requests.fundingAssessments.map((assessment) => <article key={assessment.id}><strong>{ar ? "تقييم تمويل" : "Funding assessment"}</strong><span>{assessment.status} · {assessment.score}%</span><small>{formatDate(assessment.createdAt, locale)}</small></article>)}
          {!overview.requests.marketInquiries.length && !overview.requests.jobApplications.length && !overview.requests.fundingAssessments.length ? <p>{ar ? "لا توجد طلبات مفتوحة." : "No requests yet."}</p> : null}
        </section>

        <section>
          <h2>{ar ? "تعلمي ودوراتي" : "Learning and courses"}</h2>
          {overview.learning.map((course) => <article key={course.id}><strong>{course.course.title}</strong><span>{course.status}</span><small>{course.course.completedLessons}/{course.course.totalLessons} {ar ? "دروس" : "lessons"}</small></article>)}
          {!overview.learning.length ? <p>{ar ? "لم تسجل في دورات بعد." : "No courses yet."}</p> : null}
        </section>

        <section>
          <h2>{ar ? "خدماتي" : "My services"}</h2>
          {overview.services.marketListings.map((listing) => <article key={listing.id}><strong>{listing.title}</strong><span>{ar ? "إدراج سوق" : "Market listing"} · {listing.status}</span><small>{formatDate(listing.updatedAt, locale)}</small></article>)}
          {overview.services.marketingCampaigns.map((campaign) => <article key={campaign.id}><strong>{campaign.name}</strong><span>{ar ? "حملة" : "Campaign"} · {campaign.status}</span><small>{campaign.channel} · {formatDate(campaign.updatedAt, locale)}</small></article>)}
          {overview.services.jobPostings.map((posting) => <article key={posting.id}><strong>{posting.title}</strong><span>{ar ? "إعلان وظيفة" : "Job posting"} · {posting.status}</span><small>{formatDate(posting.updatedAt, locale)}</small></article>)}
          {!overview.services.marketListings.length && !overview.services.marketingCampaigns.length && !overview.services.jobPostings.length ? <p>{ar ? "لا توجد خدمات منشأة بعد." : "No created services yet."}</p> : null}
        </section>

        <section>
          <h2>{ar ? "وصول المجتمع" : "Community access"}</h2>
          <article><strong>{overview.communityAccess.hasAccess ? (ar ? "مفعل" : "Active") : (ar ? "غير مفعل" : "Inactive")}</strong><span>{overview.communityAccess.grants.length ? overview.communityAccess.grants.map((grant) => grant.platform).join(", ") : (ar ? "لا توجد منح وصول بعد" : "No access grants yet")}</span></article>
        </section>
      </div>
    </section>
  );
}
