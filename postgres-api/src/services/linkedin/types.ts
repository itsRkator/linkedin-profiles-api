export interface DateInfo {
  year: number | null;
  month: number | null;
}

export interface ProfileImage {
  url: string | null;
  width: number | null;
  height: number | null;
}

export interface ExperienceEntry {
  company: string | null;
  companyLinkedinUrl: string | null;
  title: string | null;
  employmentType: string | null;
  location: string | null;
  description: string | null;
  startDate: DateInfo | null;
  endDate: DateInfo | null;
  isCurrent: boolean;
  companyLogoUrl: string | null;
}

export interface EducationEntry {
  school: string | null;
  degree: string | null;
  fieldOfStudy: string | null;
  startDate: DateInfo | null;
  endDate: DateInfo | null;
  description: string | null;
  schoolLogoUrl: string | null;
}

export interface CertificationEntry {
  name: string | null;
  issuingOrganization: string | null;
  issueDate: DateInfo | null;
  expirationDate: DateInfo | null;
  credentialId: string | null;
  credentialUrl: string | null;
}

export interface LanguageEntry {
  name: string | null;
  proficiency: string | null;
}

export interface NormalizedProfile {
  publicIdentifier: string;
  linkedinUrl: string;
  name: {
    first: string | null;
    last: string | null;
    full: string | null;
  };
  headline: string | null;
  location: {
    city: string | null;
    region: string | null;
    country: string | null;
    displayName: string | null;
  };
  about: string | null;
  profileImage: ProfileImage | null;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  skills: string[];
  certifications: CertificationEntry[];
  languages: LanguageEntry[];
  metadata: {
    fetchedAt: string;
    source: 'linkedin-direct-http';
    cacheHit: boolean;
    partial: boolean;
  };
}

export type FetchOutcome =
  | 'success'
  | 'auth_failure'
  | 'not_found'
  | 'forbidden'
  | 'rate_limited'
  | 'timeout'
  | 'bad_response'
  | 'error';

export interface FetchResult {
  profile: NormalizedProfile | null;
  outcome: FetchOutcome;
  durationMs: number;
  httpStatus: number | null;
  errorCategory: string | null;
}
