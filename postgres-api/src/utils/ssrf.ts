import { URL } from 'url';
import dns from 'dns';
import { promisify } from 'util';

const resolve4 = promisify(dns.resolve4);
const resolve6 = promisify(dns.resolve6);

const PRIVATE_IPV4_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./,
  /^0\./,
  /^::1$/,
  /^fc00:/i,
  /^fd00:/i,
  /^fe80:/i,
];

const PRIVATE_IPV6_RANGES = [/^::1$/, /^fc[0-9a-f]{2}:/i, /^fd[0-9a-f]{2}:/i, /^fe80:/i];

function isPrivateIP(ip: string): boolean {
  return (
    PRIVATE_IPV4_RANGES.some((r) => r.test(ip)) || PRIVATE_IPV6_RANGES.some((r) => r.test(ip))
  );
}

export async function assertNotSSRF(urlString: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error('Invalid URL');
  }

  const host = parsed.hostname;

  if (!host) {
    throw new Error('URL has no hostname');
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || /^[0-9a-f:]+$/.test(host)) {
    if (isPrivateIP(host)) {
      throw new Error('SSRF: URL resolves to a private/internal IP address');
    }
    return;
  }

  try {
    const ipv4Addresses = await resolve4(host).catch(() => [] as string[]);
    const ipv6Addresses = await resolve6(host).catch(() => [] as string[]);
    const allAddresses = [...ipv4Addresses, ...ipv6Addresses];

    for (const ip of allAddresses) {
      if (isPrivateIP(ip)) {
        throw new Error(`SSRF: ${host} resolves to private/internal address ${ip}`);
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('SSRF:')) {
      throw err;
    }
  }
}
