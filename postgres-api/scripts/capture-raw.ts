// Usage: tsx scripts/capture-raw.ts <publicIdentifier>
import 'dotenv/config';
import fs from 'fs';
import zlib from 'zlib';
import { promisify } from 'util';
import { Agent, request as undiciRequest } from 'undici';

const gunzipAsync = promisify(zlib.gunzip);
const brotliAsync = promisify(zlib.brotliDecompress);
const inflateAsync = promisify(zlib.inflate);

async function decompress(buf: Buffer, enc: string): Promise<Buffer> {
  const e = enc.toLowerCase();
  if (e.includes('br')) return brotliAsync(buf);
  if (e.includes('gzip')) return gunzipAsync(buf);
  if (e.includes('deflate')) return inflateAsync(buf);
  return buf;
}

const CHROME_CIPHERS = [
  'TLS_AES_128_GCM_SHA256','TLS_AES_256_GCM_SHA384','TLS_CHACHA20_POLY1305_SHA256',
  'ECDHE-ECDSA-AES128-GCM-SHA256','ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-ECDSA-AES256-GCM-SHA384','ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-CHACHA20-POLY1305','ECDHE-RSA-CHACHA20-POLY1305',
  'ECDHE-RSA-AES128-SHA','ECDHE-RSA-AES256-SHA','AES128-GCM-SHA256',
  'AES256-GCM-SHA384','AES128-SHA','AES256-SHA',
].join(':');

const agent = new Agent({
  allowH2: true,
  connect: {
    ciphers: CHROME_CIPHERS,
    honorCipherOrder: false,
    minVersion: 'TLSv1.2',
    ALPNProtocols: ['h2', 'http/1.1'],
  },
});

const identifier = process.argv[2] ?? 'sushilkator';

const liAt = process.env['LINKEDIN_LI_AT'] ?? '';
const jsId = process.env['LINKEDIN_JSESSIONID'] ?? '';
const bcookie = process.env['LINKEDIN_BCOOKIE'] ?? '';
const bscookie = process.env['LINKEDIN_BSCOOKIE'] ?? '';
const lidc = process.env['LINKEDIN_LIDC'] ?? '';
const liRm = process.env['LINKEDIN_LI_RM'] ?? '';
const lang = process.env['LINKEDIN_LANG'] ?? 'v=2&lang=en-us';
const liTheme = process.env['LINKEDIN_LI_THEME'] ?? '';
const sduiVer = process.env['LINKEDIN_SDUI_VER'] ?? '';
const fid = process.env['LINKEDIN_FID'] ?? '';
const cfBm = process.env['LINKEDIN_CF_BM'] ?? '';

const rawSessionId = jsId.startsWith('ajax:') ? jsId.slice(5) : jsId;
const fullSessionId = `ajax:${rawSessionId}`;

const cookieParts = [`li_at=${liAt}`, `JSESSIONID="${fullSessionId}"`];
if (bcookie) cookieParts.push(`bcookie=${bcookie}`);
if (bscookie) cookieParts.push(`bscookie=${bscookie}`);
if (lidc) cookieParts.push(`lidc=${lidc}`);
if (liRm) cookieParts.push(`li_rm=${liRm}`);
if (lang) cookieParts.push(`lang=${lang}`);
if (liTheme) cookieParts.push(`li_theme=${liTheme}`);
if (sduiVer) cookieParts.push(`sdui_ver=${sduiVer}`);
if (fid) cookieParts.push(`fid=${fid}`);
if (cfBm) cookieParts.push(`__cf_bm=${cfBm}`);

const headers: Record<string, string> = {
  Cookie: cookieParts.join('; '),
  'Csrf-Token': fullSessionId,
  'X-RestLi-Protocol-Version': '2.0.0',
  'X-Li-Lang': 'en_US',
  'X-Li-Track': JSON.stringify({ clientVersion: '1.13.14127', mpVersion: '1.13.14127', osName: 'web', timezoneOffset: 5.5, timezone: 'Asia/Calcutta', deviceFormFactor: 'DESKTOP', mpName: 'voyager-web', displayDensity: 2, displayWidth: 1920, displayHeight: 1080 }),
  Accept: 'application/vnd.linkedin.normalized+json+2.1',
  'Accept-Encoding': 'gzip, deflate, br',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent': process.env['LINKEDIN_USER_AGENT'] ?? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': `https://www.linkedin.com/in/${identifier}/`,
  'sec-ch-ua': '"Google Chrome";v="120", "Chromium";v="120", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  priority: 'u=1, i',
};

const url = `https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${identifier}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-86`;

console.log(`Fetching via HTTP/2 + Chrome TLS: ${identifier}`);
console.log(`li_at prefix: ${liAt.substring(0, 25)}...`);

(async () => {
  try {
    const res = await undiciRequest(url, { method: 'GET', headers, dispatcher: agent });

    console.log(`HTTP status: ${res.statusCode}`);
    const setCookieRaw = res.headers['set-cookie'];
    const setCookies = Array.isArray(setCookieRaw) ? setCookieRaw.join(' ') : String(setCookieRaw ?? '');

    if (setCookies.includes('li_at=delete me')) {
      console.error('❌ SESSION INVALIDATED — li_at=delete me');
      await res.body.dump();
      process.exit(1);
    }

    if (res.statusCode === 302) {
      const loc = String(res.headers['location'] ?? '');
      console.log(`302 redirect to: ${loc}`);
      await res.body.dump();

      if (loc.startsWith('https://www.linkedin.com')) {
        const r2 = await undiciRequest(loc, { method: 'GET', headers, dispatcher: agent });
        console.log(`Followed redirect → status: ${r2.statusCode}`);
        const buf2 = Buffer.from(await r2.body.arrayBuffer());
        const enc2 = String(r2.headers['content-encoding'] ?? '');
        const body2 = (await decompress(buf2, enc2)).toString('utf8');
        fs.writeFileSync(`/tmp/linkedin_raw_${identifier}.json`, body2, 'utf8');
        console.log(`✅ Saved (after redirect): /tmp/linkedin_raw_${identifier}.json (${body2.length} bytes)`);
      }
      return;
    }

    const rawBuf = Buffer.from(await res.body.arrayBuffer());
    const enc = String(res.headers['content-encoding'] ?? '');
    const body = (await decompress(rawBuf, enc)).toString('utf8');

    const out = `/tmp/linkedin_raw_${identifier}.json`;
    fs.writeFileSync(out, body, 'utf8');
    console.log(`✅ Raw response saved: ${out} (${body.length} bytes)`);
    console.log(`Content-Encoding: ${enc || 'none'}`);

    try {
      const parsed = JSON.parse(body);
      console.log('Top-level keys:', Object.keys(parsed));
      if (parsed.included) {
        console.log('included length:', parsed.included.length);
        const types = [...new Set((parsed.included as Record<string, unknown>[]).map(i => i['$type']))].slice(0, 10);
        console.log('$types:', types);
      }
    } catch { console.log('(not parseable as JSON)'); }
  } catch (err) {
    console.error('Request failed:', (err as Error).message);
    process.exit(1);
  }
})();
