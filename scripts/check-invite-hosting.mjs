import { readFile } from 'node:fs/promises';

const appStoreUrl = 'https://apps.apple.com/app/id6791332379';
const expectedAppId = '9Q39P5MUT9.com.damianmotylinski.nixapp';
const baseUrl = process.argv[2]?.replace(/\/+$/, '');
const failures = [];

const [html, association, htaccess, legalSource] = await Promise.all([
  readFile('web/invite/index.html', 'utf8'),
  readFile('web/invite/.well-known/apple-app-site-association', 'utf8'),
  readFile('web/invite/.htaccess', 'utf8'),
  readFile('src/lib/legalDocuments.ts', 'utf8'),
]);
const legalVersion = legalSource.match(/version: '([^']+)'/)?.[1];
if (!legalVersion) throw new Error('Legal document version is missing');
const publicPages = [
  ['privacy/', legalVersion], ['privacy/en/', legalVersion],
  ['terms/', legalVersion], ['terms/en/', legalVersion],
  ['support/', 'Usunięcie konta'], ['support/en/', 'Deleting your account'],
];

function validatePublicPage(path, text, marker, location) {
  if (!text.includes(marker)) failures.push(`${location} /${path} is missing its version or support content`);
  if (!text.includes('kontakt@damianmotylinski.pl')) failures.push(`${location} /${path} is missing the contact`);
  if (!text.includes('Azure')) failures.push(`${location} /${path} must disclose Azure screening`);
  if (path.startsWith('privacy') && !text.includes('OVHcloud')) failures.push(`${location} /${path} must disclose the video worker hosting`);
  const language = path.includes('/en/') ? 'en' : 'pl';
  if (!text.includes(`<html lang="${language}">`)) failures.push(`${location} /${path} has the wrong language`);
}

let aasa;
try {
  aasa = JSON.parse(association);
} catch {
  failures.push('AASA must contain valid JSON');
}

if (!html.includes(appStoreUrl)) failures.push('landing is missing the final App Store URL');
if (html.includes('__NIX_APP_STORE_URL__')) failures.push('landing still contains the App Store placeholder');
if (!html.includes('noindex,nofollow')) failures.push('invite token pages must stay out of search indexes');
if (!association.includes(expectedAppId)) failures.push('AASA contains the wrong application identifier');
if (JSON.stringify(aasa?.applinks?.details ?? []).includes('/invite/*') === false) {
  failures.push('AASA must be limited to /invite/*');
}
if (!/ForceType\s+application\/json/.test(htaccess)) failures.push('AASA JSON content type rule is missing');
if (!/RewriteRule\s+\^invite\//.test(htaccess)) failures.push('/invite/* rewrite is missing');
if (!/Referrer-Policy\s+"no-referrer"/.test(htaccess)) failures.push('Referrer-Policy header is missing');
for (const [path, marker] of publicPages) {
  const content = await readFile(`web/invite/${path}index.html`, 'utf8');
  validatePublicPage(path, content, marker, 'local');
}

if (baseUrl) {
  const aasaResponse = await fetch(`${baseUrl}/.well-known/apple-app-site-association`, {
    redirect: 'manual',
  }).catch(() => null);
  if (!aasaResponse) {
    failures.push(`could not connect to ${baseUrl}`);
  } else {
    if (aasaResponse.status !== 200) failures.push(`remote AASA returned HTTP ${aasaResponse.status}`);
    if (aasaResponse.status >= 300 && aasaResponse.status < 400) failures.push('remote AASA must not redirect');
    if (!aasaResponse.headers.get('content-type')?.toLowerCase().includes('application/json')) {
      failures.push('remote AASA must use application/json');
    }
    const remoteBody = await aasaResponse.text();
    if (!remoteBody.includes(expectedAppId)) failures.push('remote AASA contains the wrong application identifier');
  }

  const inviteResponse = await fetch(`${baseUrl}/invite/nix-healthcheck-token`, {
    redirect: 'manual',
  }).catch(() => null);
  if (!inviteResponse || inviteResponse.status !== 200) {
    failures.push('remote /invite/* route does not return the landing page');
  } else if (!(await inviteResponse.text()).includes('Private NiX invitation')) {
    failures.push('remote /invite/* route returned unexpected content');
  }

  for (const [path, marker] of publicPages) {
    const response = await fetch(`${baseUrl}/${path}`, { redirect: 'manual' }).catch(() => null);
    if (!response || response.status !== 200) {
      failures.push(`remote /${path} does not return HTTP 200`);
    } else {
      validatePublicPage(path, await response.text(), marker, 'remote');
      if (!response.headers.get('content-type')?.includes('text/html')) failures.push(`remote /${path} must use text/html`);
    }
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log(baseUrl ? 'Remote NiX invite hosting checks passed.' : 'Local NiX invite hosting checks passed.');
