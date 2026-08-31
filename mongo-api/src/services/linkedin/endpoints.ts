export const LINKEDIN_BASE_URL = 'https://www.linkedin.com';
export const VOYAGER_BASE = `${LINKEDIN_BASE_URL}/voyager/api`;

export function getProfileEndpoint(publicIdentifier: string): string {
  const encodedId = encodeURIComponent(publicIdentifier);
  return (
    `${VOYAGER_BASE}/identity/dash/profiles` +
    `?q=memberIdentity` +
    `&memberIdentity=${encodedId}` +
    `&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-86`
  );
}

export function getSkillsEndpoint(profileUrn: string): string {
  const encodedUrn = encodeURIComponent(profileUrn);
  return (
    `${VOYAGER_BASE}/identity/dash/profiles/${encodedUrn}/profileSkillsV2` +
    `?count=100` +
    `&decorationId=com.linkedin.voyager.dash.deco.identity.profile.ProfileSkillsV2-7` +
    `&q=profileIdentity`
  );
}

export const LOGIN_PAGE_INDICATORS = [
  'linkedin.com/login',
  'linkedin.com/uas/login',
  'login.linkedin.com',
  '<title>Sign In',
  'id="login-email"',
  'id="login-password"',
  '"challengeType":"EMAIL_PIN_CHALLENGE"',
];

export function isLoginPage(content: string): boolean {
  return LOGIN_PAGE_INDICATORS.some((indicator) =>
    content.toLowerCase().includes(indicator.toLowerCase()),
  );
}
