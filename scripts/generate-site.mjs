// Generates the NiX website landing page (PL at /, EN at /en/) into web/site.
// The scenes mirror the in-app welcome tour (src/components/welcome/WelcomeScenes.tsx) as CSS motion:
// the same photos, copy and order. The privacy, terms and support pages come from
// scripts/generate-legal-pages.mjs. Run with --check to verify web/site matches this source.
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const checkOnly = process.argv.includes('--check');
const contact = 'nix@shipapp.pl';
const ROOT = 'web/site';

// The drawn NiX mark (assets/brand/master/nix-mark.svg, src/components/brand/DrawnLogo.tsx):
// one continuous N stroke, then the glass rising stroke underneath it.
function mark(id) {
  return `<svg class="mark" viewBox="0 0 1024 1024" aria-hidden="true">
            <defs>
              <linearGradient id="${id}" x1="272" y1="752" x2="752" y2="272" gradientUnits="userSpaceOnUse">
                <stop offset="0" stop-color="#fff" stop-opacity="0.55" />
                <stop offset="1" stop-color="#fff" stop-opacity="0.92" />
              </linearGradient>
            </defs>
            <g fill="none" stroke-width="100" stroke-linecap="round" stroke-linejoin="round">
              <path class="rise" d="M752 272 L272 752" stroke="url(#${id})" pathLength="1" />
              <path class="stroke" d="M272 752 L272 272 L752 752" stroke="#fff" pathLength="1" />
            </g>
          </svg>`;
}

// SF Symbols-like line icons, 24 pt grid.
const ICONS = {
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.7 2.7L16 9.6"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/>',
  shieldSlash: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z"/><path d="M4 20 20 4"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>',
  flag: '<path d="M5 21V4M5 4h11.5l-2 4 2 4H5"/>',
  hand: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
  person: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5c1-3.8 4-5.8 7.5-5.8s6.5 2 7.5 5.8"/>',
  camera: '<path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3v10.5H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
};

function icon(name, extra = '') {
  return `<svg class="icon${extra}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
}

function pill(name, label, extra = '') {
  return `<span class="pill${extra}">${icon(name)}${escape(label)}</span>`;
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
    taglineLead: 'Chwile, które zostają',
    taglineAccent: 'między wami.',
    trust: ['Bez reklam', 'Bez śledzenia', 'Moderacja przed doręczeniem', 'Od 16 lat'],
    lead: 'Prywatne zdjęcia, filmy, wiadomości i głosówki — tylko z ludźmi, których sam zaprosisz.',
    cta: 'Wkrótce w App Store',
    contact: 'Napisz do nas',
    demo: {
      sticker: 'Sobota! 🔥',
      sent: 'Wysłano',
      opened: 'Otwarto',
      screenshotBlocked: 'Zrzut ekranu zablokowany',
      chatName: 'Ola',
      message1: 'Widziałaś ten zachód? 🌅',
      message2: 'Wysłałam Ci NiX-a!',
      reply: 'Bajka 😍',
      encrypted: 'Zaszyfrowane, tylko na tym iPhonie',
      checking: 'Kontrola bezpieczeństwa…',
      delivered: 'Doręczono',
      memories: 'Wspomnienia',
      widget: 'Nowe NiX-y',
      widgetCount: '3 od znajomych',
      scan: 'Zeskanuj, by dodać',
    },
    stories: [
      {
        id: 'capture',
        kicker: 'Aparat',
        title: 'Zrób zdjęcie. Dodaj naklejkę. Wyślij.',
        body: 'NiX otwiera się prosto na aparacie. Jedno stuknięcie i Twoja chwila leci do wybranych znajomych — nikogo więcej.',
        chips: ['Naklejki i podpisy', 'Zdjęcia i wideo', 'Wybierasz odbiorców'],
      },
      {
        id: 'ephemeral',
        kicker: 'Znika po obejrzeniu',
        title: 'Widać tylko tyle, ile zechcesz.',
        body: 'Ty decydujesz, jak długo widać NiX-a. Potem znika, a zrzuty ekranu NiX-ów są domyślnie zablokowane.',
        chips: ['Czas wyświetlania', 'Zrzuty zablokowane', 'Status „Otwarto”'],
      },
      {
        id: 'chat',
        kicker: 'Czat',
        title: 'Rozmowy po Twojemu.',
        body: 'Odpowiadaj na konkretne wiadomości, reaguj Tapbackiem, edytuj, cofaj wysłane i nagrywaj głosówki.',
        chips: ['Odpowiedzi', 'Tapback', 'Edycja i cofanie', 'Głosówki'],
      },
      {
        id: 'memories',
        kicker: 'Wspomnienia',
        title: 'Najlepsze chwile zostają na Twoim iPhonie.',
        body: 'Wysłane NiX-y możesz zachować w zaszyfrowanym albumie na iPhonie — nigdy na naszych serwerach.',
        chips: ['Szyfrowanie na urządzeniu', 'Limit 500 MB', 'Usuwasz kiedy chcesz'],
      },
    ],
    extrasTitle: 'I wszystko, czego jeszcze potrzebujesz',
    extras: {
      qr: ['Znajomi w sekundę', 'Kod QR albo link z zaproszeniem. Bez wgrywania kontaktów i bez obcych.'],
      widget: ['Widżety i aparat z blokady', 'Nowe NiX-y na ekranie początkowym, aparat w Centrum sterowania i na zablokowanym ekranie.'],
      private: ['Konto prywatne', 'Prywatnego konta nie da się wyszukać po nazwie — znajdą Cię tylko osoby z Twoim kodem lub zaproszeniem.'],
    },
    safetyTitle: 'Bezpieczeństwo na pierwszym miejscu',
    safetyLead: 'NiX jest dla osób od 16 lat. Chronimy rozmowy, zanim cokolwiek dotrze do odbiorcy.',
    safety: [
      ['shield', 'Kontrola przed doręczeniem', 'Tekst, zdjęcia i wybrane klatki filmów przechodzą automatyczną kontrolę bezpieczeństwa (Microsoft Azure). Treść odrzucona nie jest doręczana.'],
      ['flag', 'Zgłaszanie', 'Każdą wiadomość i każdy profil możesz zgłosić. Zgłoszenia dotyczące bezpieczeństwa dzieci trafiają na najwyższy priorytet.'],
      ['hand', 'Blokowanie', 'Zablokowana osoba nie może do Ciebie pisać ani wysyłać zaproszeń.'],
      ['person', 'Twoje konto, Twoje dane', 'Konto usuniesz w aplikacji w kilka chwil. Co i kiedy usuwamy, opisuje polityka prywatności.'],
    ],
    finalTitle: 'NiX. Tylko dla Twoich ludzi.',
    finalLead: 'Już wkrótce w App Store na iPhone’a. Masz pytania? Napisz do nas.',
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
    taglineLead: 'Moments that stay',
    taglineAccent: 'between you.',
    trust: ['No ads', 'No tracking', 'Checked before delivery', '16+'],
    lead: 'Private photos, videos, messages and voice notes — only with people you invite.',
    cta: 'Coming soon to the App Store',
    contact: 'Contact us',
    demo: {
      sticker: 'Saturday! 🔥',
      sent: 'Sent',
      opened: 'Opened',
      screenshotBlocked: 'Screenshot blocked',
      chatName: 'Ola',
      message1: 'Did you see that sunset? 🌅',
      message2: 'Just sent you a NiX!',
      reply: 'Unreal 😍',
      encrypted: 'Encrypted, only on this iPhone',
      checking: 'Safety check…',
      delivered: 'Delivered',
      memories: 'Memories',
      widget: 'New NiXes',
      widgetCount: '3 from friends',
      scan: 'Scan to add',
    },
    stories: [
      {
        id: 'capture',
        kicker: 'Camera',
        title: 'Snap it. Add a sticker. Send.',
        body: 'NiX opens straight to the camera. One tap and your moment goes to the friends you pick — nobody else.',
        chips: ['Stickers and captions', 'Photos and video', 'You pick who gets it'],
      },
      {
        id: 'ephemeral',
        kicker: 'Gone once viewed',
        title: 'Visible only as long as you want.',
        body: 'You decide how long a NiX stays visible. Then it’s gone, and screenshots of NiXes are blocked by default.',
        chips: ['View time', 'Screenshots blocked', '“Opened” status'],
      },
      {
        id: 'chat',
        kicker: 'Chat',
        title: 'Chat your way.',
        body: 'Reply to a specific message, react with a Tapback, edit, undo send and record voice notes.',
        chips: ['Replies', 'Tapback', 'Edit and undo', 'Voice notes'],
      },
      {
        id: 'memories',
        kicker: 'Memories',
        title: 'The best moments stay on your iPhone.',
        body: 'Keep NiXes you sent in an encrypted album on your iPhone — never on our servers.',
        chips: ['Encrypted on device', '500 MB limit', 'Delete any time'],
      },
    ],
    extrasTitle: 'And everything else you need',
    extras: {
      qr: ['Friends in a second', 'A QR code or an invite link. No contact upload, no strangers.'],
      widget: ['Widgets and Lock Screen camera', 'New NiXes on your Home Screen, the camera in Control Center and on the Lock Screen.'],
      private: ['Private account', 'A private account cannot be found by username — only people with your code or invite can reach you.'],
    },
    safetyTitle: 'Safety comes first',
    safetyLead: 'NiX is for people aged 16 and over. We protect conversations before anything reaches the recipient.',
    safety: [
      ['shield', 'Checked before delivery', 'Text, photos and selected video frames go through an automatic safety check (Microsoft Azure). Rejected content is never delivered.'],
      ['flag', 'Reporting', 'Report any message or profile. Child-safety reports get the highest priority.'],
      ['hand', 'Blocking', 'A blocked person cannot message you or send you invites.'],
      ['person', 'Your account, your data', 'Delete your account in the app in moments. The privacy policy explains what we delete and when.'],
    ],
    finalTitle: 'NiX. Only for your people.',
    finalLead: 'Coming soon to the App Store for iPhone. Questions? Get in touch.',
    brand: 'NiX is a ShipApp brand',
    legal: { privacy: 'Privacy policy', terms: 'Terms of service', support: 'Support' },
    paths: { privacy: '/privacy/en/', terms: '/terms/en/', support: '/support/en/' },
  },
};

function escape(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

// #region Scenes (CSS keyframes in site.css, one loop each; they play while on screen)

function heroScene() {
  return `<div class="scene hero-scene" aria-hidden="true">
          <div class="fan fan-left">${img('memories', true)}</div>
          <div class="fan fan-right">${img('capture', true)}</div>
          <div class="fan fan-center">${img('welcome', true)}</div>
          <span class="float-emoji e1">❤️</span>
          <span class="float-emoji e2">🔥</span>
          <span class="float-emoji e3">😂</span>
          <div class="app-badge">${mark('rise-hero')}</div>
        </div>`;
}

// Every image below the hero loads lazily; the hero fan loads first.
function img(name, eager = false) {
  return `<img src="/img/${name}.jpg" alt="" width="553" height="1200" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" />`;
}

function phone(inner, extra = '') {
  return `<div class="phone${extra}">
            <div class="screen">
              ${inner}
              <span class="island"></span>
            </div>
          </div>`;
}

function captureScene(d) {
  return `<div class="scene capture-scene" aria-hidden="true">
          ${phone(`<div class="viewfinder">${img('capture')}</div>
              <span class="sticker">${escape(d.sticker)}</span>
              <span class="shutter"><span></span></span>
              <span class="flash"></span>`)}
          <div class="shot">${img('capture')}<span class="sticker">${escape(d.sticker)}</span></div>
          <div class="send-row">${['o', 'k', 'm'].map((id) => `<span class="avatar"><img src="/img/avatar-${id}.jpg" alt="" width="192" height="192" loading="lazy" decoding="async" /></span>`).join('')}</div>
          ${pill('check', d.sent, ' sent-pill')}
        </div>`;
}

function ephemeralScene(d) {
  return `<div class="scene ephemeral-scene" aria-hidden="true">
          <div class="nix-card">
            ${img('ephemeral')}
            <span class="dissolve"></span>
            <svg class="ring" viewBox="0 0 58 58"><circle class="track" cx="29" cy="29" r="26.5" /><circle class="run" cx="29" cy="29" r="26.5" pathLength="1" /></svg>
            ${icon('timer', ' ring-icon')}
          </div>
          ${pill('shieldSlash', d.screenshotBlocked, ' toast')}
          ${pill('eye', d.opened, ' opened-pill')}
        </div>`;
}

const WAVE = [0.45, 0.8, 0.55, 1, 0.7, 0.4, 0.9, 0.6, 0.35, 0.75, 0.5, 0.85, 0.45, 0.6];

function chatScene(d) {
  const bars = WAVE.map((h, i) => `<i style="--h:${h};--i:${i}"></i>`).join('');
  return `<div class="scene chat-scene" aria-hidden="true">
          ${phone(`<div class="chat-header">${img('chat-face')}<span>${escape(d.chatName)}</span></div>
              <div class="thread">
                <div class="bubble in b1">${escape(d.message1)}</div>
                <div class="bubble own b2">${escape(d.message2)}<span class="tapback">❤️</span></div>
                <div class="bubble in b3 voice"><span class="voice-play"></span><span class="wave">${bars}</span></div>
                <div class="bubble own b4"><span class="quote">${escape(d.message1)}</span>${escape(d.reply)}</div>
                <div class="typing"><i></i><i></i><i></i></div>
              </div>`, ' light')}
        </div>`;
}

function memoriesScene(d) {
  const photos = [
    'memory-coffee', 'welcome', 'memory-dog',
    'memory-skate', 'memories', 'memory-hike',
    'memory-cake', 'chat-face', 'memory-city',
    'capture', 'ephemeral', 'memory-coffee',
  ];
  const cells = photos
    .map((p, i) => `<span class="cell" style="--i:${i}">${img(p)}</span>`)
    .join('');
  return `<div class="scene memories-scene" aria-hidden="true">
          ${phone(`<div class="memories-title">${escape(d.memories)}</div>
              <div class="memories-grid">${cells}</div>`, ' light')}
          ${pill('lock', d.encrypted, ' lock-pill')}
        </div>`;
}

const SCENES = { capture: captureScene, ephemeral: ephemeralScene, chat: chatScene, memories: memoriesScene };

// A QR-like pattern (decorative, not a real code).
function qr() {
  const size = 21;
  let rects = '';
  const finder = (x, y) => (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (finder(x, y)) continue;
      if ((x * 7 + y * 13 + x * y) % 5 < 2) rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
  }
  const eye = (x, y) =>
    `<rect x="${x + 0.5}" y="${y + 0.5}" width="6" height="6" rx="1.6" fill="none" stroke="currentColor"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="0.8"/>`;
  return `<svg class="qr" viewBox="-1 -1 ${size + 2} ${size + 2}">${rects}${eye(0, 0)}${eye(size - 7, 0)}${eye(0, size - 7)}</svg>`;
}

// #endregion

function landing(t) {
  const d = t.demo;
  const legalLinks = Object.entries(t.legal)
    .map(([key, label]) => `<a href="${t.paths[key]}">${escape(label)}</a>`)
    .join('\n          ');
  const stories = t.stories
    .map(
      (story, index) => `<section class="story${index % 2 ? ' flip' : ''}" id="${index === 0 ? 'features' : story.id}">
        <div class="story-text reveal">
          <p class="kicker">${escape(story.kicker)}</p>
          <h2>${escape(story.title)}</h2>
          <p>${escape(story.body)}</p>
          <ul class="chips">${story.chips.map((chip) => `<li>${escape(chip)}</li>`).join('')}</ul>
        </div>
        <div class="stage reveal">
          ${SCENES[story.id](d)}
        </div>
      </section>`,
    )
    .join('\n      ');
  const safety = t.safety
    .map(
      ([name, title, body], index) => `<article class="card reveal" style="--delay:${index * 80}ms">
          ${icon(name)}
          <h3>${escape(title)}</h3>
          <p>${escape(body)}</p>
        </article>`,
    )
    .join('\n        ');
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
    <meta property="og:url" content="https://nix.shipapp.pl${t.lang === 'pl' ? '/' : '/en/'}" />
    <meta property="og:image" content="https://nix.shipapp.pl/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:locale" content="${t.lang === 'pl' ? 'pl_PL' : 'en_US'}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="theme-color" content="#f5f5f7" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)" />
    <link rel="canonical" href="https://nix.shipapp.pl${t.lang === 'pl' ? '/' : '/en/'}" />
    <link rel="alternate" hreflang="pl" href="https://nix.shipapp.pl/" />
    <link rel="alternate" hreflang="en" href="https://nix.shipapp.pl/en/" />
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <link rel="icon" href="/icon.svg" type="image/svg+xml" />
    <link rel="preload" href="/img/welcome.jpg" as="image" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="stylesheet" href="/site.css" />
    <script src="/site.js" defer></script>
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
        <div class="glow" aria-hidden="true"></div>
        <div class="hero-text">
          <p class="eyebrow">${escape(t.eyebrow)}</p>
          <h1>${escape(t.taglineLead)} <span class="accent">${escape(t.taglineAccent)}</span></h1>
          <p class="lead">${escape(t.lead)}</p>
          <div class="actions">
            <span class="button primary" aria-disabled="true">${escape(t.cta)}</span>
            <a class="button" href="mailto:${contact}">${escape(t.contact)}</a>
          </div>
          <ul class="trust">${t.trust.map((item) => `<li>${icon('check')}${escape(item)}</li>`).join('')}</ul>
        </div>
        ${heroScene()}
      </section>
      ${stories}
      <section class="section extras">
        <h2 class="reveal">${escape(t.extrasTitle)}</h2>
        <div class="extras-grid">
          <article class="tile-card reveal">
            <div class="tile-art qr-art" aria-hidden="true">${qr()}<span class="scanline"></span></div>
            <h3>${escape(t.extras.qr[0])}</h3>
            <p>${escape(t.extras.qr[1])}</p>
          </article>
          <article class="tile-card reveal" style="--delay:80ms">
            <div class="tile-art widget-art" aria-hidden="true">
              <div class="widget"><img src="/icon.svg" alt="" /><strong>${escape(d.widget)}</strong><span>${escape(d.widgetCount)}</span><b class="count">3</b></div>
              <div class="control">${icon('camera')}</div>
            </div>
            <h3>${escape(t.extras.widget[0])}</h3>
            <p>${escape(t.extras.widget[1])}</p>
          </article>
          <article class="tile-card reveal" style="--delay:160ms">
            <div class="tile-art private-art" aria-hidden="true">
              <div class="search"><span>@ola</span><i></i></div>
              <div class="lock-badge">${icon('lock')}</div>
            </div>
            <h3>${escape(t.extras.private[0])}</h3>
            <p>${escape(t.extras.private[1])}</p>
          </article>
        </div>
      </section>
      <section id="safety" class="section safety">
        <div class="safety-head reveal">
          <h2>${escape(t.safetyTitle)}</h2>
          <p class="section-lead">${escape(t.safetyLead)}</p>
        </div>
        <div class="check-demo reveal" aria-hidden="true">
          <div class="check-bubble">${img('welcome')}<span class="scan"></span></div>
          ${pill('shield', d.checking, ' checking')}
          ${pill('check', d.delivered, ' delivered')}
        </div>
        <div class="grid">
        ${safety}
        </div>
      </section>
      <section class="final reveal">
        <div class="final-icon">${mark('rise-final')}</div>
        <h2>${escape(t.finalTitle)}</h2>
        <p>${escape(t.finalLead)}</p>
        <div class="actions">
          <span class="button primary" aria-disabled="true">${escape(t.cta)}</span>
          <a class="button" href="mailto:${contact}">${contact}</a>
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

// Served by Caddy for any missing path (handle_errors); bilingual, no scripts.
function notFound() {
  return `<!doctype html>
<html lang="pl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="robots" content="noindex" />
    <meta name="color-scheme" content="light dark" />
    <title>404 · NiX</title>
    <link rel="icon" href="/icon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/site.css" />
  </head>
  <body>
    <main>
      <section class="final not-found">
        <div class="final-icon">${mark('rise-404')}</div>
        <h2>Nie ma takiej strony</h2>
        <p lang="en">This page doesn’t exist.</p>
        <div class="actions">
          <a class="button primary" href="/">Strona główna</a>
          <a class="button" href="/en/" lang="en">Home (English)</a>
        </div>
      </section>
    </main>
  </body>
</html>
`;
}

async function saveFile(path, content) {
  const target = `${ROOT}/${path}`;
  if (checkOnly) {
    if ((await readFile(target, 'utf8')) !== content) throw new Error(`${target} differs from its source; run npm run generate:site`);
    return;
  }
  await writeFile(target, content);
}

await save('/', landing(copy.pl));
await save('/en/', landing(copy.en));
await saveFile('404.html', notFound());
console.log(checkOnly ? 'Website landing matches its source.' : 'Generated the website landing (PL/EN).');
