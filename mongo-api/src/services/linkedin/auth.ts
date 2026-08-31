import crypto from 'crypto';
import { config } from '../../config/index.js';

export type LinkedInHeaders = Record<string, string>;

export function buildLinkedInHeaders(profileIdentifier = ''): LinkedInHeaders {
  const {
    liAt,
    jsessionId,
    userAgent,
    bcookie,
    bscookie,
    lidc,
    liRm,
    lang,
    liTheme,
    liThemeSet,
    sduiVer,
    fid,
    aamUuid,
    gcl_au,
    cfBm,
  } = config.linkedin;

  if (!liAt || !jsessionId) {
    throw new Error(
      'LinkedIn credentials not configured: LINKEDIN_LI_AT and LINKEDIN_JSESSIONID are required',
    );
  }

  const rawSessionId = jsessionId.startsWith('ajax:') ? jsessionId.slice(5) : jsessionId;
  const fullSessionId = `ajax:${rawSessionId}`;

  const cookieParts: string[] = [`li_at=${liAt}`, `JSESSIONID="${fullSessionId}"`];

  if (bcookie) cookieParts.push(`bcookie=${bcookie}`);
  if (bscookie) cookieParts.push(`bscookie=${bscookie}`);
  if (lidc) cookieParts.push(`lidc=${lidc}`);
  if (liRm) cookieParts.push(`li_rm=${liRm}`);
  if (lang) cookieParts.push(`lang=${lang}`);
  if (liTheme) cookieParts.push(`li_theme=${liTheme}`);
  if (liThemeSet) cookieParts.push(`li_theme_set=${liThemeSet}`);
  if (sduiVer) cookieParts.push(`sdui_ver=${sduiVer}`);
  if (fid) cookieParts.push(`fid=${fid}`);
  if (aamUuid) cookieParts.push(`aam_uuid=${aamUuid}`);
  if (gcl_au) cookieParts.push(`_gcl_au=${gcl_au}`);
  if (cfBm) cookieParts.push(`__cf_bm=${cfBm}`);

  const pageInstanceId = crypto.randomBytes(18).toString('base64url');
  const pageInstance = `urn:li:page:d_flagship3_profile_view_base;${pageInstanceId}`;

  const referer = profileIdentifier
    ? `https://www.linkedin.com/in/${profileIdentifier}/`
    : 'https://www.linkedin.com/feed/';

  return {
    Cookie: cookieParts.join('; '),
    'Csrf-Token': fullSessionId,
    'X-RestLi-Protocol-Version': '2.0.0',
    'X-Li-Lang': 'en_US',
    'X-Li-Track': JSON.stringify({
      clientVersion: '1.13.14127',
      mpVersion: '1.13.14127',
      osName: 'web',
      timezoneOffset: 5.5,
      timezone: 'Asia/Calcutta',
      deviceFormFactor: 'DESKTOP',
      mpName: 'voyager-web',
      displayDensity: 2,
      displayWidth: 1920,
      displayHeight: 1080,
    }),
    'X-Li-Page-Instance': pageInstance,
    Accept: 'application/vnd.linkedin.normalized+json+2.1',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': userAgent,
    Referer: referer,
    'sec-ch-ua': '"Google Chrome";v="120", "Chromium";v="120", "Not-A.Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    priority: 'u=1, i',
  };
}

export function hasLinkedInCredentials(): boolean {
  return Boolean(config.linkedin.liAt && config.linkedin.jsessionId);
}
