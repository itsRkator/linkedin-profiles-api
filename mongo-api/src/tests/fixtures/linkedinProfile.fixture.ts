const GEO_URN = 'urn:li:fsd_geo:12345';
const COMPANY_URN = 'urn:li:fsd_company:12345';
const SCHOOL_URN = 'urn:li:fsd_school:67890';
const EMPLOYMENT_TYPE_URN = 'urn:li:fsd_employmentType:12';

export const MOCK_VOYAGER_PROFILE_RESPONSE = {
  data: {
    entityUrn: 'urn:li:collectionResponse:TEST',
    '*elements': 'urn:li:collectionResponse:TEST_ELEMENTS',
    paging: { count: 10, start: 0, total: 1 },
    $type: 'com.linkedin.restli.common.CollectionResponse',
  },
  included: [
    // Geo entity — resolved via profile.geoLocation['*geo']
    {
      entityUrn: GEO_URN,
      defaultLocalizedName: 'San Francisco, California, United States',
      defaultLocalizedNameWithoutCountryName: 'San Francisco, California',
      $type: 'com.linkedin.voyager.dash.common.Geo',
    },

    // Main Profile entity
    {
      entityUrn: 'urn:li:fsd_profile:MOCK_URN_SANITIZED',
      $type: 'com.linkedin.voyager.dash.identity.profile.Profile',
      firstName: 'Jane',
      lastName: 'Doe',
      headline: 'Software Engineer at Test Company',
      summary: 'Experienced software engineer with focus on backend systems.',
      geoLocation: {
        '*geo': GEO_URN,
        geoUrn: GEO_URN,
        $type: 'com.linkedin.voyager.dash.identity.profile.ProfileGeoLocation',
      },
      profilePicture: {
        displayImageReference: {
          vectorImage: {
            rootUrl: 'https://media.licdn.com/dms/image/test/',
            artifacts: [
              { width: 100, height: 100, fileIdentifyingUrlPathSegment: 'photo100.jpg' },
              { width: 400, height: 400, fileIdentifyingUrlPathSegment: 'photo400.jpg' },
            ],
          },
        },
      },
    },

    // Company entity — resolved via Position['*company']
    {
      entityUrn: COMPANY_URN,
      $type: 'com.linkedin.voyager.dash.organization.Company',
      name: 'Test Company',
      url: 'https://www.linkedin.com/company/test-company/',
      logo: {
        vectorImage: {
          rootUrl: 'https://media.licdn.com/dms/image/test/company-logo_',
          artifacts: [
            { width: 200, height: 200, fileIdentifyingUrlPathSegment: 'logo200.jpg' },
          ],
        },
      },
    },

    // School entity — resolved via Education['*school']
    {
      entityUrn: SCHOOL_URN,
      $type: 'com.linkedin.voyager.dash.organization.School',
      name: 'State University',
      logo: {
        vectorImage: {
          rootUrl: 'https://media.licdn.com/dms/image/test/school-logo_',
          artifacts: [
            { width: 200, height: 200, fileIdentifyingUrlPathSegment: 'school200.jpg' },
          ],
        },
      },
    },

    // EmploymentType entity — resolved via Position['*employmentType']
    {
      entityUrn: EMPLOYMENT_TYPE_URN,
      $type: 'com.linkedin.voyager.dash.identity.profile.EmploymentType',
      name: 'Full-time',
    },

    // Position entity
    {
      entityUrn: 'urn:li:fsd_profilePosition:(MOCK_URN_SANITIZED,1001)',
      $type: 'com.linkedin.voyager.dash.identity.profile.Position',
      title: 'Backend Engineer',
      companyName: 'Test Company',
      companyUrn: COMPANY_URN,
      '*company': COMPANY_URN,
      '*employmentType': EMPLOYMENT_TYPE_URN,
      locationName: 'San Francisco, CA',
      description: null,
      dateRange: {
        start: { year: 2021, month: 3, $type: 'com.linkedin.common.Date' },
        $type: 'com.linkedin.common.DateRange',
      },
    },

    // Education entity
    {
      entityUrn: 'urn:li:fsd_profileEducation:(MOCK_URN_SANITIZED,2001)',
      $type: 'com.linkedin.voyager.dash.identity.profile.Education',
      schoolName: 'State University',
      degreeName: 'B.S.',
      fieldOfStudy: 'Computer Science',
      '*school': SCHOOL_URN,
      description: null,
      dateRange: {
        start: { year: 2015, $type: 'com.linkedin.common.Date' },
        end: { year: 2019, $type: 'com.linkedin.common.Date' },
        $type: 'com.linkedin.common.DateRange',
      },
    },

    // Skill entities
    {
      entityUrn: 'urn:li:fsd_skill:(MOCK_URN_SANITIZED,3001)',
      $type: 'com.linkedin.voyager.dash.identity.profile.Skill',
      name: 'Node.js',
    },
    {
      entityUrn: 'urn:li:fsd_skill:(MOCK_URN_SANITIZED,3002)',
      $type: 'com.linkedin.voyager.dash.identity.profile.Skill',
      name: 'TypeScript',
    },
    {
      entityUrn: 'urn:li:fsd_skill:(MOCK_URN_SANITIZED,3003)',
      $type: 'com.linkedin.voyager.dash.identity.profile.Skill',
      name: 'PostgreSQL',
    },

    // Certification entity
    {
      entityUrn: 'urn:li:fsd_profileCertification:(MOCK_URN_SANITIZED,4001)',
      $type: 'com.linkedin.voyager.dash.identity.profile.Certification',
      name: 'Sample Certification',
      authority: 'Sample Authority',
      licenseNumber: null,
      url: null,
      dateRange: {
        start: { year: 2023, month: 6, $type: 'com.linkedin.common.Date' },
        $type: 'com.linkedin.common.DateRange',
      },
    },

    // Language entity
    {
      entityUrn: 'urn:li:fsd_profileLanguage:(MOCK_URN_SANITIZED,5001)',
      $type: 'com.linkedin.voyager.dash.identity.profile.Language',
      name: 'English',
      proficiency: 'NATIVE_OR_BILINGUAL',
    },
  ],
};

export const MOCK_LOGIN_PAGE_RESPONSE = `
<!DOCTYPE html>
<html>
<head><title>Sign In to LinkedIn</title></head>
<body>
  <div id="login-email"></div>
  <div id="login-password"></div>
</body>
</html>
`;

export const MOCK_EMPTY_PROFILE_RESPONSE = {
  data: {
    entityUrn: 'urn:li:collectionResponse:EMPTY',
    '*elements': 'urn:li:collectionResponse:EMPTY_ELEMENTS',
    paging: { count: 0, start: 0, total: 0 },
    $type: 'com.linkedin.restli.common.CollectionResponse',
  },
  included: [],
};

export const MOCK_MINIMAL_PROFILE_RESPONSE = {
  data: {
    entityUrn: 'urn:li:collectionResponse:MINIMAL',
    '*elements': 'urn:li:collectionResponse:MINIMAL_ELEMENTS',
    paging: { count: 1, start: 0, total: 1 },
    $type: 'com.linkedin.restli.common.CollectionResponse',
  },
  included: [
    {
      entityUrn: 'urn:li:fsd_profile:MOCK_MINIMAL',
      $type: 'com.linkedin.voyager.dash.identity.profile.Profile',
      firstName: 'John',
      lastName: null,
      headline: null,
    },
  ],
};
