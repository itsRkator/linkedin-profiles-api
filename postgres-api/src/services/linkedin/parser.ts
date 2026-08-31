import {
  NormalizedProfile,
  DateInfo,
  ExperienceEntry,
  EducationEntry,
  CertificationEntry,
  LanguageEntry,
  ProfileImage,
} from './types.js';

type AnyObject = Record<string, unknown>;

function safeStr(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') return val.trim() || null;
  return null;
}

function safeNum(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  const parsed = Number(val);
  return Number.isNaN(parsed) ? null : parsed;
}


function safeArr(val: unknown): unknown[] {
  return Array.isArray(val) ? val : [];
}

function safeObj(val: unknown): AnyObject | null {
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    return val as AnyObject;
  }
  return null;
}

function parseDateInfo(obj: unknown): DateInfo | null {
  const d = safeObj(obj);
  if (!d) return null;
  const year = safeNum(d['year']);
  if (!year) return null;
  return { year, month: safeNum(d['month']) };
}

function parseVectorImage(vectorImage: AnyObject): ProfileImage | null {
  const rootUrl = safeStr(vectorImage['rootUrl']);
  const artifacts = safeArr(vectorImage['artifacts']);
  if (!rootUrl || artifacts.length === 0) return null;

  const sorted = [...artifacts]
    .map((a) => safeObj(a))
    .filter((a): a is AnyObject => a !== null)
    .sort((a, b) => (safeNum(b['width']) ?? 0) - (safeNum(a['width']) ?? 0));

  const best = sorted.at(0);
  if (!best) return null;

  const segment = safeStr(best['fileIdentifyingUrlPathSegment']);
  if (!segment) return null;

  return {
    url: `${rootUrl}${segment}`,
    width: safeNum(best['width']),
    height: safeNum(best['height']),
  };
}

function parseVectorImageUrl(vectorImage: unknown): string | null {
  const img = parseVectorImage(safeObj(vectorImage) ?? {});
  return img?.url ?? null;
}

function resolveEntityLogo(entity: AnyObject | null): string | null {
  if (!entity) return null;
  const logoObj = safeObj(entity['logo']);
  return parseVectorImageUrl(logoObj?.['vectorImage']);
}

function resolveUrnRef(obj: AnyObject, field: string, included: AnyObject[]): AnyObject | null {
  const urn = safeStr(obj[field] ?? obj[field.replace('*', '')]);
  if (!urn) return null;
  return findByUrn(included, urn);
}

function extractIncluded(raw: AnyObject): AnyObject[] {
  const included = raw['included'];
  if (Array.isArray(included)) {
    return included.filter((i): i is AnyObject => i !== null && typeof i === 'object');
  }
  return [];
}

function filterByType(included: AnyObject[], typeSuffix: string): AnyObject[] {
  const lower = typeSuffix.toLowerCase();
  return included.filter((item) => {
    return safeStr(item['$type'])?.toLowerCase().endsWith(lower) ?? false;
  });
}

function findByUrn(included: AnyObject[], urn: string): AnyObject | null {
  for (const item of included) {
    if (item['entityUrn'] === urn) return item;
  }
  return null;
}

function extractProfileElement(raw: AnyObject): AnyObject | null {
  const included = extractIncluded(raw);
  return (
    filterByType(included, '.identity.profile.Profile').find(
      (item) => item['firstName'] !== undefined || item['lastName'] !== undefined || item['headline'] !== undefined,
    ) ?? null
  );
}

function parseName(profile: AnyObject): NormalizedProfile['name'] {
  const first = safeStr(profile['firstName']);
  const last = safeStr(profile['lastName']);
  const full = [first, last].filter(Boolean).join(' ') || null;
  return { first, last, full };
}

function parseLocation(profile: AnyObject, included: AnyObject[]): NormalizedProfile['location'] {
  const geoLocationObj = safeObj(profile['geoLocation']);
  const geoUrn = safeStr(geoLocationObj?.['*geo'] ?? geoLocationObj?.['geoUrn']);

  if (geoUrn) {
    const geoEntity = findByUrn(included, geoUrn);
    if (geoEntity) {
      const displayName = safeStr(geoEntity['defaultLocalizedName']);
      const withoutCountry = safeStr(geoEntity['defaultLocalizedNameWithoutCountryName']);
      const parts = (displayName ?? withoutCountry ?? '').split(',').map((p) => p.trim());
      return {
        displayName,
        city: parts[0] ?? null,
        region: parts[1] ?? null,
        country: parts.at(-1) ?? null,
      };
    }
  }

  const directName = safeStr(profile['geoLocationName'] ?? profile['locationName']);
  if (directName) {
    const parts = directName.split(',').map((p: string) => p.trim());
    return {
      displayName: directName,
      city: parts[0] ?? null,
      region: parts[1] ?? null,
      country: parts[2] ?? null,
    };
  }

  const countryCode = safeStr(safeObj(profile['location'])?.['countryCode']);
  if (countryCode) {
    return { displayName: countryCode, city: null, region: null, country: countryCode };
  }

  return { city: null, region: null, country: null, displayName: null };
}

function parseProfileImage(profile: AnyObject): ProfileImage | null {
  const picObj = safeObj(profile['profilePicture']);
  if (!picObj) return null;

  const displayRef = safeObj(picObj['displayImageReference']);
  const frameRef = safeObj(picObj['displayImageWithFrameReference']);
  const vectorImage = safeObj(
    displayRef?.['vectorImage'] ??
      frameRef?.['vectorImage'] ??
      picObj['displayImage'] ??
      picObj['vectorImage'],
  );

  if (vectorImage) {
    const img = parseVectorImage(vectorImage);
    if (img) return img;
  }

  const picUrl = safeStr(picObj['url'] ?? profile['profilePictureUrl']);
  if (picUrl) return { url: picUrl, width: null, height: null };

  return null;
}

function parseAbout(profile: AnyObject): string | null {
  const summary = safeStr(profile['summary']);
  if (summary) return summary;

  const multiLocale = safeObj(profile['multiLocaleSummary']);
  if (multiLocale) {
    const enUs = safeStr(multiLocale['en_US']);
    if (enUs) return enUs;

    for (const value of Object.values(multiLocale)) {
      const text = safeStr(value);
      if (text) return text;
    }
  }

  return null;
}

function parseExperience(included: AnyObject[]): ExperienceEntry[] {
  const positions = filterByType(included, '.identity.profile.Position');

  return positions
    .map((p): ExperienceEntry | null => {
      const title = safeStr(p['title']);
      const company = safeStr(p['companyName']);
      if (!title && !company) return null;

      const dateRange = safeObj(p['dateRange']);
      const startDate = parseDateInfo(dateRange?.['start']);
      const endDate = parseDateInfo(dateRange?.['end']);
      const isCurrent = !endDate;

      const companyEntity = resolveUrnRef(p, '*company', included);
      const companyUrn = safeStr(p['companyUrn'] ?? companyEntity?.['entityUrn']);

      let companyLinkedinUrl: string | null = null;
      if (companyEntity) {
        companyLinkedinUrl = safeStr(companyEntity['url']);
      }
      if (!companyLinkedinUrl && companyUrn) {
        const match = /:(\d+)\)?$/.exec(companyUrn);
        if (match?.[1]) companyLinkedinUrl = `https://www.linkedin.com/company/${match[1]}/`;
      }

      const employmentTypeEntity = resolveUrnRef(p, '*employmentType', included);
      const employmentType = safeStr(employmentTypeEntity?.['name']);

      const companyLogoUrl = resolveEntityLogo(companyEntity);

      return {
        company,
        companyLinkedinUrl,
        title,
        employmentType,
        location: safeStr(p['locationName'] ?? p['geoLocationName']),
        description: safeStr(p['description']),
        startDate,
        endDate,
        isCurrent,
        companyLogoUrl,
      };
    })
    .filter((e): e is ExperienceEntry => e !== null);
}

function parseEducation(included: AnyObject[]): EducationEntry[] {
  const educations = filterByType(included, '.identity.profile.Education');

  return educations
    .map((e): EducationEntry | null => {
      const school = safeStr(e['schoolName']);
      const degree = safeStr(e['degreeName']);
      if (!school && !degree) return null;

      const dateRange = safeObj(e['dateRange']);
      const startDate = parseDateInfo(dateRange?.['start']);
      const endDate = parseDateInfo(dateRange?.['end']);

      const schoolEntity = resolveUrnRef(e, '*school', included);
      const schoolLogoUrl = resolveEntityLogo(schoolEntity);

      return {
        school,
        degree,
        fieldOfStudy: safeStr(e['fieldOfStudy']),
        startDate,
        endDate,
        description: safeStr(e['description']),
        schoolLogoUrl,
      };
    })
    .filter((e): e is EducationEntry => e !== null);
}

function parseSkills(included: AnyObject[]): string[] {
  return filterByType(included, '.identity.profile.Skill')
    .map((s) => safeStr(s['name']))
    .filter((s): s is string => s !== null);
}

function parseCertifications(included: AnyObject[]): CertificationEntry[] {
  return filterByType(included, '.identity.profile.Certification')
    .map((c): CertificationEntry | null => {
      const name = safeStr(c['name']);
      if (!name) return null;

      const dateRange = safeObj(c['dateRange']);
      const issueDate = parseDateInfo(dateRange?.['start']);
      const expirationDate = parseDateInfo(dateRange?.['end']);

      // `multiLocaleAuthority.en_US` is the issuing org name
      const authority =
        safeStr(c['authority']) ??
        safeStr(safeObj(c['multiLocaleAuthority'])?.['en_US']);

      return {
        name,
        issuingOrganization: authority,
        issueDate,
        expirationDate,
        credentialId: safeStr(c['licenseNumber']),
        credentialUrl: safeStr(c['url']),
      };
    })
    .filter((c): c is CertificationEntry => c !== null);
}

const PROFICIENCY_MAP: Record<string, string> = {
  NATIVE_OR_BILINGUAL: 'Native or bilingual',
  FULL_PROFESSIONAL: 'Full professional',
  PROFESSIONAL_WORKING: 'Professional working',
  LIMITED_WORKING: 'Limited working',
  ELEMENTARY: 'Elementary',
};

function parseLanguages(included: AnyObject[]): LanguageEntry[] {
  return filterByType(included, '.identity.profile.Language')
    .map((l): LanguageEntry | null => {
      const name = safeStr(l['name']);
      if (!name) return null;

      const rawProf = safeStr(l['proficiency']);
      const proficiency = rawProf ? (PROFICIENCY_MAP[rawProf] ?? rawProf) : null;

      return { name, proficiency };
    })
    .filter((l): l is LanguageEntry => l !== null);
}

export function parseLinkedInProfile(
  raw: unknown,
  publicIdentifier: string,
  normalizedUrl: string,
): NormalizedProfile {
  const rawObj = safeObj(raw);
  if (!rawObj) {
    return buildEmptyProfile(publicIdentifier, normalizedUrl);
  }

  const included = extractIncluded(rawObj);
  const profile = extractProfileElement(rawObj);

  if (!profile) {
    return buildEmptyProfile(publicIdentifier, normalizedUrl);
  }

  const name = parseName(profile);
  const headline = safeStr(profile['headline']);
  const about = parseAbout(profile);
  const location = parseLocation(profile, included);
  const profileImage = parseProfileImage(profile);

  const experience = parseExperience(included);
  const education = parseEducation(included);
  const skills = parseSkills(included);
  const certifications = parseCertifications(included);
  const languages = parseLanguages(included);

  const partial = name.full === null && headline === null;

  return {
    publicIdentifier,
    linkedinUrl: normalizedUrl,
    name,
    headline,
    location,
    about,
    profileImage,
    experience,
    education,
    skills,
    certifications,
    languages,
    metadata: {
      fetchedAt: new Date().toISOString(),
      source: 'linkedin-direct-http',
      cacheHit: false,
      partial,
    },
  };
}

function buildEmptyProfile(publicIdentifier: string, normalizedUrl: string): NormalizedProfile {
  return {
    publicIdentifier,
    linkedinUrl: normalizedUrl,
    name: { first: null, last: null, full: null },
    headline: null,
    location: { city: null, region: null, country: null, displayName: null },
    about: null,
    profileImage: null,
    experience: [],
    education: [],
    skills: [],
    certifications: [],
    languages: [],
    metadata: {
      fetchedAt: new Date().toISOString(),
      source: 'linkedin-direct-http',
      cacheHit: false,
      partial: true,
    },
  };
}

