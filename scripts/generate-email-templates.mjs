// Generates the Supabase Auth email templates (supabase/templates/*.html) in the style of
// nix.shipapp.pl (web/site/site.css): system grays, the indigo brand tile, pill buttons.
// Styles are inline for mail clients; the <style> block only adds dark mode where supported.
// Copy is PL + EN like the app; the template picks PL from the user's metadata locale.
//   node scripts/generate-email-templates.mjs          write the templates
//   node scripts/generate-email-templates.mjs --check  fail if a template is out of date
import { readFile, writeFile } from 'node:fs/promises';

const checkOnly = process.argv.includes('--check');

// The app opens /auth/confirm links only on this origin (Universal Links + src/lib/authDeepLink.ts).
const AUTH_LINK_ORIGIN = 'https://nix.damianmotylinski.pl';
const SITE = 'https://nix.shipapp.pl';
const LOGO = `${SITE}/apple-touch-icon.png`;

const color = {
  bg: '#f5f5f7',
  surface: '#ffffff',
  label: '#111113',
  secondary: '#6e6e73',
  tertiary: '#8e8e93',
  separator: '#e5e5ea',
  accent: '#4b4df0',
  codeBg: '#f5f5f7',
};

const font = '-apple-system, BlinkMacSystemFont, &quot;SF Pro Text&quot;, &quot;Helvetica Neue&quot;, Helvetica, Arial, sans-serif';

/** The confirmation link the app understands; only signup and recovery carry one. */
const confirmLink = (type) => `${AUTH_LINK_ORIGIN}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=${type}`;

const common = {
  pl: {
    auto: 'Ta wiadomość została wysłana automatycznie — nie odpowiadaj na nią.',
    brand: 'NiX jest marką ShipApp.',
    help: 'Pomoc',
    privacy: 'Prywatność',
    helpHref: `${SITE}/support/`,
    privacyHref: `${SITE}/privacy/`,
    orButton: 'Masz NiX na tym iPhonie? Możesz też po prostu dotknąć:',
  },
  en: {
    auto: 'This message was sent automatically — please don’t reply.',
    brand: 'NiX is a ShipApp brand.',
    help: 'Support',
    privacy: 'Privacy',
    helpHref: `${SITE}/support/en/`,
    privacyHref: `${SITE}/privacy/en/`,
    orButton: 'Reading this on the iPhone with NiX? You can also just tap:',
  },
};

const templates = {
  confirmation: {
    pl: {
      title: 'Potwierdź swój e-mail',
      lead: 'Jeszcze jeden krok i jesteś w NiX. Wpisz ten kod w aplikacji, żeby potwierdzić adres i aktywować konto.',
      codeLabel: 'Twój kod',
      button: 'Potwierdź w aplikacji',
      ignore: 'Nie zakładałeś konta w NiX? Zignoruj tę wiadomość — bez potwierdzenia konto nie zostanie aktywowane.',
    },
    en: {
      title: 'Confirm your email',
      lead: 'One more step and you’re in. Enter this code in NiX to confirm your address and activate your account.',
      codeLabel: 'Your code',
      button: 'Confirm in the app',
      ignore: 'Didn’t sign up for NiX? Ignore this email — the account won’t be activated without confirmation.',
    },
    link: confirmLink('signup'),
  },
  recovery: {
    pl: {
      title: 'Ustaw nowe hasło',
      lead: 'Ktoś — miejmy nadzieję, że Ty — poprosił o reset hasła do konta NiX. Wpisz ten kod w aplikacji i ustaw nowe hasło.',
      codeLabel: 'Kod resetu',
      button: 'Zresetuj w aplikacji',
      ignore: 'To nie Ty? Zignoruj tę wiadomość. Twoje hasło się nie zmieni, a kod wkrótce wygaśnie.',
    },
    en: {
      title: 'Set a new password',
      lead: 'Someone — hopefully you — asked to reset the password for your NiX account. Enter this code in the app to choose a new one.',
      codeLabel: 'Reset code',
      button: 'Reset in the app',
      ignore: 'Wasn’t you? Ignore this email. Your password stays the same and the code will expire soon.',
    },
    link: confirmLink('recovery'),
  },
  magic_link: {
    pl: {
      title: 'Twój kod logowania',
      lead: 'Wpisz ten kod w aplikacji NiX, żeby się zalogować.',
      codeLabel: 'Kod logowania',
      ignore: 'Nie próbowałeś się logować? Zignoruj tę wiadomość — bez kodu nikt nie wejdzie na Twoje konto.',
    },
    en: {
      title: 'Your sign-in code',
      lead: 'Enter this code in NiX to sign in.',
      codeLabel: 'Sign-in code',
      ignore: 'Didn’t try to sign in? Ignore this email — nobody can get in without the code.',
    },
  },
  invite: {
    pl: {
      title: 'Zaproszenie do NiX',
      lead: 'Ktoś zaprosił Cię do NiX — miejsca na prywatne chwile z najbliższymi. Wpisz ten kod w aplikacji, żeby dołączyć.',
      codeLabel: 'Kod zaproszenia',
      ignore: 'Nie spodziewałeś się zaproszenia? Po prostu zignoruj tę wiadomość.',
    },
    en: {
      title: 'You’re invited to NiX',
      lead: 'Someone invited you to NiX — a place for private moments with your people. Enter this code in the app to join.',
      codeLabel: 'Invite code',
      ignore: 'Not expecting an invite? Just ignore this email.',
    },
  },
  email_change: {
    pl: {
      title: 'Potwierdź nowy e-mail',
      lead: 'Zmieniasz adres e-mail konta NiX na <strong style="color:#111113;">{{ .NewEmail }}</strong>. Wpisz ten kod w aplikacji, żeby potwierdzić zmianę.',
      codeLabel: 'Kod potwierdzenia',
      ignore: 'To nie Ty? Zignoruj tę wiadomość — bez kodu adres się nie zmieni, a Twoje konto jest bezpieczne.',
    },
    en: {
      title: 'Confirm your new email',
      lead: 'You’re changing your NiX account email to <strong style="color:#111113;">{{ .NewEmail }}</strong>. Enter this code in the app to confirm.',
      codeLabel: 'Confirmation code',
      ignore: 'Wasn’t you? Ignore this email — the address won’t change without the code and your account is safe.',
    },
  },
  reauthentication: {
    pl: {
      title: 'Potwierdź, że to Ty',
      lead: 'Wykonujesz w NiX ważną operację na koncie. Wpisz ten kod w aplikacji, żeby kontynuować.',
      codeLabel: 'Kod weryfikacyjny',
      ignore: 'Nie prosiłeś o kod? Zignoruj tę wiadomość i rozważ zmianę hasła.',
    },
    en: {
      title: 'Confirm it’s you',
      lead: 'You’re making an important change to your NiX account. Enter this code in the app to continue.',
      codeLabel: 'Verification code',
      ignore: 'Didn’t ask for a code? Ignore this email and consider changing your password.',
    },
  },
  password_changed: {
    pl: {
      title: 'Hasło zostało zmienione',
      lead: 'Hasło do konta NiX powiązanego z adresem <strong style="color:#111113;">{{ .Email }}</strong> zostało właśnie zmienione. Jeśli to Ty — wszystko w porządku, nic nie musisz robić.',
      ignore: 'To nie Ty? Od razu zresetuj hasło w aplikacji („Nie pamiętasz hasła?” na ekranie logowania) i napisz do nas: nix@shipapp.pl.',
    },
    en: {
      title: 'Your password was changed',
      lead: 'The password for the NiX account linked to <strong style="color:#111113;">{{ .Email }}</strong> was just changed. If that was you, you’re all set.',
      ignore: 'Wasn’t you? Reset your password in the app right away (“Forgot password?” on the sign-in screen) and contact us at nix@shipapp.pl.',
    },
  },
};

function codeBlock(label) {
  return `
              <tr><td style="padding:28px 0 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="code-box" style="background:${color.codeBg};border-radius:18px;">
                  <tr><td align="center" style="padding:20px 16px 22px;">
                    <div class="secondary" style="font-family:${font};font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${color.secondary};">${label}</div>
                    <div class="label" style="font-family:${font};font-size:36px;font-weight:700;letter-spacing:10px;color:${color.label};padding:8px 0 0 10px;">{{ .Token }}</div>
                  </td></tr>
                </table>
              </td></tr>`;
}

function buttonBlock(copy, label, href) {
  return `
              <tr><td align="center" style="padding:24px 0 0;">
                <div class="secondary" style="font-family:${font};font-size:14px;line-height:1.45;color:${color.secondary};padding:0 0 12px;">${copy.orButton}</div>
                <a href="${href}" style="display:inline-block;background:${color.accent};color:#ffffff;font-family:${font};font-size:16px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:999px;">${label}</a>
              </td></tr>`;
}

function body(lang, spec, link) {
  const copy = common[lang];
  const t = spec[lang];
  return `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card" style="background:${color.surface};border:1px solid ${color.separator};border-radius:28px;">
            <tr><td style="padding:36px 32px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center">
                <img src="${LOGO}" width="56" height="56" alt="NiX" style="display:block;border:0;border-radius:14px;">
              </td></tr>
              <tr><td align="center" style="padding:22px 0 0;">
                <h1 class="label" style="margin:0;font-family:${font};font-size:28px;line-height:1.15;font-weight:700;letter-spacing:-0.02em;color:${color.label};">${t.title}</h1>
              </td></tr>
              <tr><td align="center" style="padding:12px 0 0;">
                <p class="secondary" style="margin:0;font-family:${font};font-size:16px;line-height:1.5;color:${color.secondary};">${t.lead}</p>
              </td></tr>${t.codeLabel ? codeBlock(t.codeLabel) : ''}${link ? buttonBlock(copy, t.button, link) : ''}
              <tr><td style="padding:28px 0 0;"><div class="rule" style="border-top:1px solid ${color.separator};font-size:0;line-height:0;">&nbsp;</div></td></tr>
              <tr><td align="center" style="padding:20px 0 0;">
                <p class="secondary" style="margin:0;font-family:${font};font-size:14px;line-height:1.5;color:${color.secondary};">${t.ignore}</p>
              </td></tr>
              </table>
            </td></tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:20px 24px 0;font-family:${font};font-size:12px;line-height:1.6;color:${color.tertiary};">
              ${copy.auto}<br>
              ${copy.brand} <a href="${SITE}" style="color:${color.tertiary};">nix.shipapp.pl</a> · <a href="${copy.helpHref}" style="color:${color.tertiary};">${copy.help}</a> · <a href="${copy.privacyHref}" style="color:${color.tertiary};">${copy.privacy}</a>
            </td></tr>
          </table>`;
}

function render(name, spec) {
  return `<!DOCTYPE html>
<!-- Generated by scripts/generate-email-templates.mjs — edit the generator, not this file. -->
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>NiX</title>
  <style>
    body { margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
    a { color: ${color.accent}; }
    @media (prefers-color-scheme: dark) {
      .page { background: #000000 !important; }
      .card { background: #111114 !important; border-color: #2c2c30 !important; }
      .code-box { background: #1c1c20 !important; }
      .label, .label strong, .secondary strong { color: #f5f5f7 !important; }
      .secondary { color: #a1a1a6 !important; }
      .rule { border-color: #2c2c30 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${color.bg};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="page" style="background:${color.bg};">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
        <tr><td>
      {{ if or (eq .Data.language "pl") (eq .Data.locale "pl") }}${body('pl', spec, spec.link)}
      {{ else }}${body('en', spec, spec.link)}
      {{ end }}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
`;
}

let stale = [];
for (const [name, spec] of Object.entries(templates)) {
  const file = new URL(`../supabase/templates/${name}.html`, import.meta.url);
  const html = render(name, spec);
  if (checkOnly) {
    const current = await readFile(file, 'utf8').catch(() => '');
    if (current !== html) stale.push(name);
  } else {
    await writeFile(file, html);
  }
}
if (stale.length) {
  console.error(`Out of date: ${stale.join(', ')}. Run npm run generate:email-templates.`);
  process.exit(1);
}
console.log(checkOnly ? 'Email templates are up to date.' : `Wrote ${Object.keys(templates).length} email templates.`);
