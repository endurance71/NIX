// Generates the NiX website landing page (PL at /, EN at /en/) into web/site.
// The privacy, terms and support pages come from scripts/generate-legal-pages.mjs, which writes the
// same documents the app shows. Run with --check to verify web/site matches this source.
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const checkOnly = process.argv.includes('--check');
const contact = 'nix@shipapp.pl';
const ROOT = 'web/site';

// The drawn NiX mark (assets/brand/master/nix-mark.svg, src/components/brand/DrawnLogo.tsx):
// one continuous N stroke, then the glass rising stroke underneath it.
const MARK = `<svg class="mark" viewBox="0 0 1024 1024" aria-hidden="true">
          <defs>
            <linearGradient id="rise" x1="272" y1="752" x2="752" y2="272" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="#fff" stop-opacity="0.55" />
              <stop offset="1" stop-color="#fff" stop-opacity="0.92" />
            </linearGradient>
          </defs>
          <g fill="none" stroke-width="100" stroke-linecap="round" stroke-linejoin="round">
            <path class="rise" d="M752 272 L272 752" stroke="url(#rise)" pathLength="1" />
            <path class="stroke" d="M272 752 L272 272 L752 752" stroke="#fff" pathLength="1" />
          </g>
        </svg>`;

// SF Symbols-like line icons, 24 pt grid.
const ICONS = {
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>',
  chat: '<path d="M4 5.5h16v10H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  qr: '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.2"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.2"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.2"/><path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM14 20.5h1M20.5 14v1"/>',
  widget: '<rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="2"/><rect x="3.5" y="13" width="17" height="7.5" rx="2"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><path d="M4 20 20 4"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/>',
  flag: '<path d="M5 21V4M5 4h11.5l-2 4 2 4H5"/>',
  hand: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
  person: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5c1-3.8 4-5.8 7.5-5.8s6.5 2 7.5 5.8"/>',
};

function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
}

const copy = {
  pl: {
    lang: 'pl',
    title: 'NiX — prywatne zdjęcia i rozmowy z przyjaciółmi',
    description:
      'NiX to prywatny komunikator na iPhone’a: zdjęcia, filmy, wiadomości i głosówki tylko dla zaakceptowanych znajomych.',
    nav: { features: 'Funkcje', safety: 'Bezpieczeństwo', support: 'Pomoc', other: 'English', otherHref: '/en/' },
    eyebrow: 'Na iPhone’a',
    tagline: 'Chwile, które zostają między wami.',
    lead: 'Prywatne zdjęcia, filmy, wiadomości i głosówki — tylko z ludźmi, których sam zaprosisz.',
    cta: 'Wkrótce w App Store',
    contact: 'Napisz do nas',
    featuresTitle: 'Wszystko, czego potrzeba do bliskich rozmów',
    features: [
      ['timer', 'Znika po obejrzeniu', 'Ty decydujesz, jak długo widać NiX-a. Zrzuty ekranu NiX-ów są domyślnie zablokowane.'],
      ['chat', 'Rozmowy po Twojemu', 'Odpowiadaj na konkretne wiadomości, reaguj, edytuj, cofaj wysłane i nagrywaj głosówki.'],
      ['lock', 'Wspomnienia tylko na Twoim iPhonie', 'Wysłane NiX-y możesz zachować w zaszyfrowanym albumie na iPhonie — nigdy na naszych serwerach.'],
      ['qr', 'Znajomi w sekundę', 'Dodawaj przez kod QR albo wyślij zaproszenie. Bez listy kontaktów i bez obcych.'],
      ['widget', 'Widżety i aparat z blokady', 'Nowe NiX-y na ekranie początkowym, aparat w Centrum sterowania i na zablokowanym ekranie.'],
      ['eye', 'Konto prywatne', 'Prywatnego konta nie da się wyszukać po nazwie — znajdą Cię tylko osoby z Twoim kodem lub zaproszeniem.'],
    ],
    safetyTitle: 'Bezpieczeństwo na pierwszym miejscu',
    safetyLead: 'NiX jest dla osób od 16 lat. Chronimy rozmowy, zanim cokolwiek dotrze do odbiorcy.',
    safety: [
      ['shield', 'Kontrola przed doręczeniem', 'Tekst, zdjęcia i wybrane klatki filmów przechodzą automatyczną kontrolę bezpieczeństwa (Microsoft Azure). Treść odrzucona nie jest doręczana.'],
      ['flag', 'Zgłaszanie', 'Każdą wiadomość i każdy profil możesz zgłosić. Zgłoszenia dotyczące bezpieczeństwa dzieci trafiają na najwyższy priorytet.'],
      ['hand', 'Blokowanie', 'Zablokowana osoba nie może do Ciebie pisać ani wysyłać zaproszeń.'],
      ['person', 'Twoje konto, Twoje dane', 'Konto usuniesz w aplikacji w kilka chwil. Co i kiedy usuwamy, opisuje polityka prywatności.'],
    ],
    brand: 'NiX jest marką ShipApp',
    legal: { privacy: 'Polityka prywatności', terms: 'Regulamin', support: 'Pomoc' },
    paths: { privacy: '/privacy/', terms: '/terms/', support: '/support/' },
  },
  en: {
    lang: 'en',
    title: 'NiX — private photos and chats with friends',
    description:
      'NiX is a private iPhone messenger: photos, videos, messages and voice notes only with friends you accept.',
    nav: { features: 'Features', safety: 'Safety', support: 'Support', other: 'Polski', otherHref: '/' },
    eyebrow: 'For iPhone',
    tagline: 'Moments that stay between you.',
    lead: 'Private photos, videos, messages and voice notes — only with people you invite.',
    cta: 'Coming soon to the App Store',
    contact: 'Contact us',
    featuresTitle: 'Everything you need for close conversations',
    features: [
      ['timer', 'Gone once viewed', 'You decide how long a NiX stays visible. Screenshots of NiXes are blocked by default.'],
      ['chat', 'Chat your way', 'Reply to a specific message, react, edit, undo send and record voice notes.'],
      ['lock', 'Memories only on your iPhone', 'Keep NiXes you sent in an encrypted album on your iPhone — never on our servers.'],
      ['qr', 'Friends in a second', 'Add friends with a QR code or an invite link. No contact upload, no strangers.'],
      ['widget', 'Widgets and Lock Screen camera', 'New NiXes on your Home Screen, the camera in Control Center and on the Lock Screen.'],
      ['eye', 'Private account', 'A private account cannot be found by username — only people with your code or invite can reach you.'],
    ],
    safetyTitle: 'Safety comes first',
    safetyLead: 'NiX is for people aged 16 and over. We protect conversations before anything reaches the recipient.',
    safety: [
      ['shield', 'Checked before delivery', 'Text, photos and selected video frames go through an automatic safety check (Microsoft Azure). Rejected content is never delivered.'],
      ['flag', 'Reporting', 'Report any message or profile. Child-safety reports get the highest priority.'],
      ['hand', 'Blocking', 'A blocked person cannot message you or send you invites.'],
      ['person', 'Your account, your data', 'Delete your account in the app in moments. The privacy policy explains what we delete and when.'],
    ],
    brand: 'NiX is a ShipApp brand',
    legal: { privacy: 'Privacy policy', terms: 'Terms of service', support: 'Support' },
    paths: { privacy: '/privacy/en/', terms: '/terms/en/', support: '/support/en/' },
  },
};

function escape(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function card([name, title, body]) {
  return `<article class="card">
          ${icon(name)}
          <h3>${escape(title)}</h3>
          <p>${escape(body)}</p>
        </article>`;
}

function landing(t) {
  const legalLinks = Object.entries(t.legal)
    .map(([key, label]) => `<a href="${t.paths[key]}">${escape(label)}</a>`)
    .join('\n          ');
  return `<!doctype html>
<html lang="${t.lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
    <meta name="robots" content="index,follow" />
    <meta name="color-scheme" content="light dark" />
    <title>${escape(t.title)}</title>
    <meta name="description" content="${escape(t.description)}" />
    <meta property="og:title" content="${escape(t.title)}" />
    <meta property="og:description" content="${escape(t.description)}" />
    <meta property="og:type" content="website" />
    <link rel="alternate" hreflang="pl" href="https://nix.shipapp.pl/" />
    <link rel="alternate" hreflang="en" href="https://nix.shipapp.pl/en/" />
    <link rel="icon" href="/icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="stylesheet" href="/site.css" />
  </head>
  <body>
    <header class="top">
      <nav aria-label="${t.lang === 'pl' ? 'Nawigacja' : 'Navigation'}">
        <a class="brand" href="${t.lang === 'pl' ? '/' : '/en/'}"><img src="/icon.svg" alt="" width="28" height="28" />NiX</a>
        <div class="links">
          <a href="#features">${t.nav.features}</a>
          <a href="#safety">${t.nav.safety}</a>
          <a href="${t.paths.support}">${t.nav.support}</a>
          <a href="${t.nav.otherHref}" lang="${t.lang === 'pl' ? 'en' : 'pl'}">${t.nav.other}</a>
        </div>
      </nav>
    </header>
    <main>
      <section class="hero">
        <div class="tile">
          ${MARK}
        </div>
        <p class="eyebrow">${escape(t.eyebrow)}</p>
        <h1>${escape(t.tagline)}</h1>
        <p class="lead">${escape(t.lead)}</p>
        <div class="actions">
          <span class="button primary" aria-disabled="true">${escape(t.cta)}</span>
          <a class="button" href="mailto:${contact}">${escape(t.contact)}</a>
        </div>
      </section>
      <section id="features" class="section">
        <h2>${escape(t.featuresTitle)}</h2>
        <div class="grid">
        ${t.features.map(card).join('\n        ')}
        </div>
      </section>
      <section id="safety" class="section safety">
        <h2>${escape(t.safetyTitle)}</h2>
        <p class="section-lead">${escape(t.safetyLead)}</p>
        <div class="grid two">
        ${t.safety.map(card).join('\n        ')}
        </div>
      </section>
    </main>
    <footer>
      <div class="footer-inner">
        <p><strong>${escape(t.brand)}</strong> · MT Hub Damian Motyliński · <a href="mailto:${contact}">${contact}</a></p>
        <p class="footer-links">
          ${legalLinks}
        </p>
      </div>
    </footer>
  </body>
</html>
`;
}

async function save(path, content) {
  const target = `${ROOT}${path}index.html`;
  if (checkOnly) {
    const existing = await readFile(target, 'utf8');
    if (existing !== content) throw new Error(`${target} differs from its source; run npm run generate:site`);
    return;
  }
  await mkdir(`${ROOT}${path}`, { recursive: true });
  await writeFile(target, content);
}

await save('/', landing(copy.pl));
await save('/en/', landing(copy.en));
console.log(checkOnly ? 'Website landing matches its source.' : 'Generated the website landing (PL/EN).');
