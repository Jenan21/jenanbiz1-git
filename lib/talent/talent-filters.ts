import type { DiscoverableTalent, OwnedTalentApplication, TalentPosting } from "@/components/talent/talent-flow-types";

function terms(value: string) {
  return value.split(/[,،\n]/).map((term) => term.trim().toLocaleLowerCase()).filter(Boolean);
}

function includesAll(source: string[], required: string[]) {
  const normalized = source.map((value) => value.toLocaleLowerCase());
  return required.every((term) => normalized.some((value) => value.includes(term)));
}

export type JobFilters = { city: string; countryCode: string; minSalaryMajor: number | null; query: string; skills: string; sort: "quality" | "recent" | "salary"; workMode: string };

export function filterTalentJobs(postings: TalentPosting[], viewerId: string, filters: JobFilters) {
  const query = filters.query.trim().toLocaleLowerCase();
  const requiredSkills = terms(filters.skills);
  return postings.filter((posting) => {
    if (posting.status !== "PUBLISHED" || posting.createdById === viewerId) return false;
    if (query && !`${posting.title} ${posting.description} ${posting.department ?? ""} ${(posting.requiredSkills ?? []).join(" ")} ${posting.city ?? ""} ${posting.countryCode ?? ""}`.toLocaleLowerCase().includes(query)) return false;
    if (filters.workMode && posting.workMode !== filters.workMode) return false;
    if (filters.countryCode && posting.countryCode !== filters.countryCode) return false;
    if (filters.city && !posting.city?.toLocaleLowerCase().includes(filters.city.trim().toLocaleLowerCase())) return false;
    if (requiredSkills.length && !includesAll(posting.requiredSkills ?? [], requiredSkills)) return false;
    if (filters.minSalaryMajor !== null && (posting.salaryMaxMinor ?? -1) < filters.minSalaryMajor * 100) return false;
    return true;
  }).toSorted((left, right) => filters.sort === "recent" ? new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime() : filters.sort === "salary" ? (right.salaryMaxMinor ?? -1) - (left.salaryMaxMinor ?? -1) : right.qualityScore - left.qualityScore || new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

export type TalentFilters = { availability: string; countryCode: string; minExperience: number | null; query: string; skills: string; sort: "experience" | "recent"; workMode: string };

export function filterDiscoverableTalent(candidates: DiscoverableTalent[], filters: TalentFilters) {
  const query = filters.query.trim().toLocaleLowerCase();
  const requiredSkills = terms(filters.skills);
  return candidates.filter((candidate) => {
    if (query && !`${candidate.user.profile?.displayName ?? ""} ${candidate.headline} ${candidate.summary} ${(candidate.skills ?? []).join(" ")} ${candidate.city ?? ""} ${candidate.countryCode ?? ""}`.toLocaleLowerCase().includes(query)) return false;
    if (filters.countryCode && candidate.countryCode !== filters.countryCode) return false;
    if (filters.minExperience !== null && candidate.yearsExperience < filters.minExperience) return false;
    if (filters.availability && !candidate.availability?.toLocaleLowerCase().includes(filters.availability.trim().toLocaleLowerCase())) return false;
    if (filters.workMode && !(candidate.desiredWorkModes ?? []).includes(filters.workMode)) return false;
    if (requiredSkills.length && !includesAll(candidate.skills ?? [], requiredSkills)) return false;
    return true;
  }).toSorted((left, right) => filters.sort === "experience" ? right.yearsExperience - left.yearsExperience || new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime() : new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

export type ApplicantFilters = { jobPostingId: string; minMatch: number | null; sort: "match" | "oldest" | "recent"; status: string };

export function filterTalentApplicants(applications: OwnedTalentApplication[], filters: ApplicantFilters) {
  return applications.filter((application) => (!filters.status || application.status === filters.status) && (!filters.jobPostingId || application.jobPosting.id === filters.jobPostingId) && (filters.minMatch === null || application.matchScore >= filters.minMatch)).toSorted((left, right) => filters.sort === "match" ? right.matchScore - left.matchScore || new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime() : filters.sort === "oldest" ? new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() : new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}