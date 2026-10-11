import { mkdir, readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';

const legalSource = await readFile(new URL('../src/lib/legalDocuments.ts', import.meta.url), 'utf8');
const legalModule = Buffer.from(ts.transpileModule(legalSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64');
const { legalDocuments } = await import(`data:text/javascript;base64,${legalModule}`);

const checkOnly = process.argv.includes('--check');
const contact = 'kontakt@damianmotylinski.pl';
const labels = {
  pl: { privacy: 'Polityka prywatności', terms: 'Regulamin', support: 'Pomoc', version: 'Wersja', effective: 'obowiązuje od', language: 'English' },
  en: { privacy: 'Privacy policy', terms: 'Terms of service', support: 'Support', version: 'Version', effective: 'effective', language: 'Polski' },
};

function escape(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function pathFor(kind, locale) {
  return `/${kind}/${locale === 'en' ? 'en/' : ''}`;
}

function page(locale, kind, sections, meta = '') {
  const text = labels[locale];
  const links = ['privacy', 'terms', 'support'].map((key) => `<a href="${pathFor(key, locale)}">${text[key]}</a>`).join('');
  const otherLocale = locale === 'pl' ? 'en' : 'pl';
  const content = sections.map(({ title, body }) => `<section><h2>${escape(title)}</h2><p>${escape(body).replaceAll(contact, `<a href="mailto:${contact}">${contact}</a>`)}</p></section>`).join('\n      ');
  return `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="robots" content="index,follow" />
    <title>${text[kind]} · NiX Now Chat</title>
    <link rel="stylesheet" href="/legal.css" />
  </head>
  <body>
    <header><nav aria-label="${locale === 'pl' ? 'Nawigacja' : 'Navigation'}"><a class="brand" href="/">NiX</a><div class="links">${links}<a href="${pathFor(kind, otherLocale)}" lang="${otherLocale}" hreflang="${otherLocale}">${text.language}</a></div></nav></header>
    <main>
      <h1>${text[kind]}</h1>
      ${meta}
      ${content}
    </main>
    <footer>NiX Now Chat · <a href="mailto:${contact}">${contact}</a></footer>
  </body>
</html>
`;
}

const support = {
  pl: [
    { title: 'Kontakt i pomoc', body: `Napisz na ${contact}. Opisz problem, model urządzenia, wersję iOS i wersję aplikacji. Nie przesyłaj hasła, kodów logowania ani prywatnych wiadomości. NiX Now Chat jest bezpłatną aplikacją do rozmów z zaakceptowanymi znajomymi dla osób od 16. roku życia.` },
    { title: 'Logowanie', body: 'Loguj się adresem e-mail, a nie nazwą użytkownika. Jeśli nie pamiętasz hasła, użyj opcji jego odzyskania na ekranie logowania i sprawdź skrzynkę oraz spam. Jeżeli konto utworzono przez Zaloguj się przez Apple, użyj tej samej metody. Konto e-mail i konto Apple mogą być odrębne.' },
    { title: 'Wysyłanie i odbieranie', body: 'Do rozmowy wymagane jest zaakceptowane zaproszenie znajomego i połączenie z Internetem. Tekst, zdjęcia i wybrane klatki filmu przechodzą automatyczną kontrolę Azure przed doręczeniem. Treść odrzucona nie jest doręczana. Kamera i mikrofon wymagają zgody iOS; można ją zmienić w Ustawieniach urządzenia.' },
    { title: 'Zgłoszenie nadużycia i blokowanie', body: `W rozmowie przytrzymaj wiadomość, aby otworzyć opcję zgłoszenia. Zgłoś konkretną treść i wybierz powód. Blokowanie użytkownika jest dostępne w menu nagłówka rozmowy. Blokada ogranicza kontakt między kontami. W sprawach bezpieczeństwa, decyzji moderacji lub odwołania napisz na ${contact}; nie wysyłaj nielegalnych treści jako załączników.` },
    { title: 'Usunięcie konta', body: `W aplikacji otwórz Profil, sekcję Konto i Usuń konto. Potwierdź nazwę użytkownika i ponownie się uwierzytelnij. Usunięcie jest nieodwracalne; wylogowanie lub usunięcie aplikacji nie usuwa konta. Jeśli nie możesz wejść do aplikacji, napisz na ${contact} ze skrzynki powiązanej z kontem. Przed realizacją potwierdzimy tożsamość.` },
    { title: 'Prywatność i powiadomienia', body: 'Powiadomienia push są opcjonalne i można je wyłączyć w Profilu lub Ustawieniach iOS. Treści mają ograniczony czas dostępności; nie traktuj aplikacji jako archiwum. Polityka prywatności i regulamin są dostępne w nawigacji tej strony i w Profilu aplikacji.' },
  ],
  en: [
    { title: 'Contact and help', body: `Email ${contact}. Describe the issue, device model, iOS version and app version. Do not send passwords, login codes or private messages. NiX Now Chat is a free app for conversations with accepted friends, for people aged 16 and older.` },
    { title: 'Signing in', body: 'Sign in with your email address, not your username. If you forgot your password, use password recovery on the login screen and check your inbox and spam folder. If you created the account with Sign in with Apple, use the same method. Email and Apple accounts can be separate.' },
    { title: 'Sending and receiving', body: 'Conversations require an accepted friend invitation and an Internet connection. Text, images and selected video frames undergo automated Azure checks before delivery. Rejected content is not delivered. The camera and microphone require iOS permission, which can be changed in device Settings.' },
    { title: 'Reporting abuse and blocking', body: `In a conversation, touch and hold a message to open its reporting option. Report the specific content and select a reason. User blocking is available in the conversation header menu. Blocking restricts contact between accounts. For safety concerns, moderation decisions or appeals, email ${contact}; do not attach illegal content.` },
    { title: 'Deleting your account', body: `In the app, open Profile, the Account section and Delete account. Confirm your username and reauthenticate. Deletion is irreversible; signing out or uninstalling the app does not delete your account. If you cannot access the app, email ${contact} from the address associated with your account. We will verify your identity before processing the request.` },
    { title: 'Privacy and notifications', body: 'Push notifications are optional and can be disabled in Profile or iOS Settings. Content has limited availability; do not use the app as an archive. The privacy policy and terms are available in this page’s navigation and in the app’s Profile.' },
  ],
};

async function save(path, content) {
  const target = `web/invite${path}index.html`;
  if (checkOnly) {
    const existing = await readFile(target, 'utf8');
    if (existing !== content) throw new Error(`${target} differs from the app's legal documents; run npm run generate:legal-pages`);
    return;
  }
  await mkdir(`web/invite${path}`, { recursive: true });
  await writeFile(target, content);
}

for (const locale of ['pl', 'en']) {
  for (const kind of ['privacy', 'terms']) {
    const document = legalDocuments[locale][kind];
    const text = labels[locale];
    const meta = `<p class="meta">${text.version} ${document.version} · ${text.effective} ${document.effectiveDate}</p>`;
    await save(pathFor(kind, locale), page(locale, kind, document.sections, meta));
  }
  await save(pathFor('support', locale), page(locale, 'support', support[locale]));
}
console.log(checkOnly ? 'Legal and support pages match their source.' : 'Generated legal and support pages (PL/EN).');
