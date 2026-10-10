export type TalentPosting = {
  id: string;
  createdById: string;
  organizationId: string | null;
  title: string;
  description: string;
  benefits: string | null;
  conditions: string | null;
  department: string | null;
  countryCode: string | null;
  city: string | null;
  currency: string;
  salaryMinMinor: number | null;
  salaryMaxMinor: number | null;
  requiredSkills: string[] | null;
  qualityScore: number;
  qualitySignals: Record<string, unknown> | null;
  workMode: "ON_SITE" | "HYBRID" | "REMOTE";
  status: "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED";
  organization: { id: string; name: string } | null;
  createdBy: { email: string; profile: { displayName: string | null } | null };
  applications: { applicantId: string; matchScore: number; status: string }[];
  questions: { id: string; prompt: string; required: boolean; sequence: number }[];
  createdAt: string;
  updatedAt: string;
};

export type TalentCv = { id: string; title: string; currentVersion: number; updatedAt: string; content?: Record<string, unknown> };
export type TalentMessageRecord = { id: string; senderId: string; body: string; createdAt: string; sender: { profile: { displayName: string | null } | null } };
export type TalentInterviewRecord = {
  id: string;
  applicationId: string;
  createdById: string;
  scheduledAt: string;
  durationMinutes: number;
  mode: "VIDEO" | "PHONE" | "ON_SITE";
  location: string | null;
  notes: string | null;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
};

export type TalentProfileRecord = {
  id: string;
  headline: string;
  summary: string;
  city: string | null;
  countryCode: string | null;
  yearsExperience: number;
  skills: string[] | null;
  experience: string | null;
  education: string | null;
  desiredWorkModes: string[] | null;
  availability: string | null;
  cvDocumentId: string | null;
  isDiscoverable: boolean;
  cvDocument: TalentCv | null;
  updatedAt: string;
};

export type OwnedTalentApplication = {
  id: string;
  applicantId: string;
  matchScore: number;
  matchSignals: { matchedSkills?: string[]; missingSkills?: string[]; candidateSkills?: string[] } | null;
  message: string | null;
  profileSnapshot: { headline?: string; summary?: string; city?: string | null; countryCode?: string | null; yearsExperience?: number; skills?: string[]; experience?: string | null; education?: string | null; availability?: string | null } | null;
  consentVersion: string | null;
  consentedAt: string | null;
  employerNotes: string | null;
  status: "SUBMITTED" | "UNDER_REVIEW" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";
  jobPosting: { id: string; title: string };
  applicant: { email: string; profile: { displayName: string | null } | null };
  cvDocument: TalentCv | null;
  answers: { id: string; questionId: string; promptSnapshot: string; answer: string }[];
  interviews: TalentInterviewRecord[];
  messages: TalentMessageRecord[];
  createdAt: string;
  updatedAt: string;
};

export type MyTalentApplication = {
  id: string;
  matchScore: number;
  status: OwnedTalentApplication["status"];
  message: string | null;
  employerNotes: string | null;
  jobPosting: TalentPosting;
  cvDocument: TalentCv | null;
  answers?: { id: string; questionId: string; promptSnapshot: string; answer: string }[];
  interviews: TalentInterviewRecord[];
  messages: TalentMessageRecord[];
  createdAt: string;
  updatedAt: string;
};

export type DiscoverableTalent = {
  id: string;
  headline: string;
  summary: string;
  city: string | null;
  countryCode: string | null;
  yearsExperience: number;
  skills: string[] | null;
  desiredWorkModes: string[] | null;
  availability: string | null;
  updatedAt: string;
  user: { profile: { displayName: string | null } | null };
};

export type CandidateMatch = { posting: TalentPosting; score: number; signals: { matchedSkills?: string[]; missingSkills?: string[] } };
export type EmployerMatch = { postingId: string; postingTitle: string; candidate: DiscoverableTalent & { userId: string }; score: number; signals: { matchedSkills?: string[]; missingSkills?: string[] } };

export type TalentPayload = {
  success: boolean;
  message?: string;
  viewerId: string;
  postings: TalentPosting[];
  applications: OwnedTalentApplication[];
  ownApplications: MyTalentApplication[];
  savedJobs: { id: string; jobPostingId: string; createdAt: string; jobPosting: TalentPosting }[];
  talentProfile: { profile: TalentProfileRecord | null; cvDocuments: TalentCv[] };
  talent: DiscoverableTalent[];
  matches: { candidateMatches: CandidateMatch[]; employerMatches: EmployerMatch[] };
  organizations: { isOwner: boolean; organization: { id: string; name: string } }[];
};