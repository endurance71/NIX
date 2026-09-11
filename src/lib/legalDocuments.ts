export type LegalSection = {
  title: string;
  body: string;
};

type LegalDocument = {
  version: string;
  effectiveDate: string;
  sections: LegalSection[];
};

export const legalDocuments: Record<'pl' | 'en', { privacy: LegalDocument; terms: LegalDocument }> = {
  pl: {
    privacy: {
      version: '2026-09-05',
      effectiveDate: '5 września 2026 r.',
      sections: [
        {
          title: 'Administrator danych i kontakt',
          body: 'Administratorem Twoich danych osobowych jest MT Hub Damian Motyliński, ul. ks. Józefa Poniatowskiego 27a lok. 2, 76-200 Słupsk, NIP 8393229228. W sprawach prywatności skontaktuj się z nami: kontakt@damianmotylinski.pl. Skargę możesz złożyć do Prezesa Urzędu Ochrony Danych Osobowych.',
        },
        {
          title: 'Jakie dane przetwarzamy',
          body: 'Przetwarzamy e-mail i dane uwierzytelniania, identyfikator konta, nazwę użytkownika, nazwę wyświetlaną, opis profilu, awatar, relacje znajomych, zaproszenia QR, potwierdzenie ukończenia 16 lat bez zapisywania daty urodzenia, blokady, zgłoszenia nadużyć, ustawienia ochrony przechwytywania ekranu, treść i metadane wiadomości tekstowych i multimedialnych, token powiadomień, identyfikator instalacji urządzenia, model urządzenia, wersję iOS i aplikacji, język aplikacji, prywatny stan przeczytania rozmów oraz techniczne logi.',
        },
        {
          title: 'Cele i podstawy prawne',
          body: 'Dane są potrzebne do założenia i prowadzenia konta oraz dostarczenia wiadomości — wykonanie umowy (art. 6 ust. 1 lit. b RODO). Przetwarzamy je również dla bezpieczeństwa, zapobiegania nadużyciom i obrony roszczeń — uzasadniony interes administratora (art. 6 ust. 1 lit. f RODO), a gdy jest to wymagane — dla obowiązku prawnego (art. 6 ust. 1 lit. c RODO).',
        },
        {
          title: 'Powiadomienia push',
          body: 'Powiadomienia push są opcjonalne i możesz je wyłączyć niezależnie na każdym urządzeniu w Profilu albo w ustawieniach iOS. Powiadomienie może zawierać nazwę użytkownika oraz rodzaj zdarzenia, ale nie zawiera zdjęcia, filmu ani miniatury wiadomości.',
        },
        {
          title: 'Opcjonalna analityka produktu',
          body: 'Za odrębną, dobrowolną zgodą możemy zbierać ograniczone zdarzenia analityki produktu: identyfikator instalacji, nazwę zdarzenia z zamkniętej listy, wersję aplikacji, język, czas i ograniczone właściwości. Zdarzenia nie zawierają treści wiadomości, nazwy użytkownika, ścieżek mediów ani tokenów. Identyfikator instalacji może być powiązany z kontem przez tabele instalacji i powiadomień push (nie jest to anonimowa analityka). Przed zgodą klient nie wysyła zdarzeń. Zgodę możesz odmówić przy onboarding i w każdej chwili wycofać w Profil → Prywatność i bezpieczeństwo. W aktualnym publicznym kandydacie analityka produktu jest wyłączona flagą builda.',
        },
        {
          title: 'Uprawnienia urządzenia',
          body: 'Kamera, mikrofon i biblioteka zdjęć są używane wyłącznie po nadaniu uprawnień przez system iOS: do utworzenia wiadomości zdjęciowej lub wideo oraz ustawienia awatara. Możesz odmówić lub cofnąć uprawnienie w ustawieniach urządzenia; odpowiednia funkcja aplikacji nie będzie wtedy dostępna.',
        },
        {
          title: 'Wiadomości i ochrona prywatności',
          body: 'Wiadomości są dostępne wyłącznie wskazanemu odbiorcy. Po odczycie aplikacja podejmuje usunięcie pliku multimedialnego. Rekord techniczny wiadomości może pozostać przez okres niezbędny do wykonania usunięcia i obsługi błędów. Ograniczenie screenshotów jest funkcją systemową i nie gwarantuje całkowitego uniemożliwienia utrwalenia treści.',
        },
        {
          title: 'Odbiorcy danych',
          body: 'Dane mogą być przetwarzane przez Supabase (uwierzytelnianie, baza, Storage i funkcje serwerowe w UE), Apple (Sign in with Apple i App Store) oraz Expo/EAS (budowa, dystrybucja i powiadomienia push), tylko w zakresie koniecznym do usługi. Zainstalowane SDK Sentry jest w publicznym buildzie twardo wyłączone i nie otrzymuje danych, dopóki nie zostanie jawnie włączone osobną decyzją release.',
        },
        {
          title: 'Transfery poza EOG',
          body: 'Jeżeli dostawca przetwarza dane poza Europejskim Obszarem Gospodarczym, transfer odbywa się wyłącznie z zastosowaniem odpowiedniego mechanizmu prawnego, w tym decyzji stwierdzającej odpowiedni stopień ochrony lub standardowych klauzul umownych (rozdział V RODO). Aktualną informację otrzymasz pod adresem kontaktowym.',
        },
        {
          title: 'Okres przechowywania',
          body: 'Konto, profil i potwierdzenie wieku przechowujemy do usunięcia konta. Aktywne tokeny powiadomień — do wyłączenia powiadomień, wylogowania, usunięcia konta albo informacji, że urządzenie nie jest już zarejestrowane. Surowe zdarzenia dobrowolnej analityki (gdy włączona) i techniczną historię dostarczenia powiadomień przechowujemy do 30 dni; dzienne agregaty analityczne nie zawierają identyfikatora instalacji. Media usuwamy po odczycie. Efemeryczne wiadomości tekstowe usuwamy automatycznie po 24 godzinach od wysłania. Kopię wiadomości zabezpieczoną po zgłoszeniu usuwamy po 30 dniach. Rozstrzygnięte zgłoszenia i audyt decyzji przechowujemy do 365 dni, a logi techniczne do 30 dni. Otwarte zgłoszenie pozostaje do rozstrzygnięcia.',
        },
        {
          title: 'Twoje prawa',
          body: 'Masz prawo żądać dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, przenoszenia oraz sprzeciwu — gdy ma zastosowanie. Możesz też złożyć skargę do Prezesa Urzędu Ochrony Danych Osobowych. Wnioski wyślij na kontakt@damianmotylinski.pl.',
        },
        {
          title: 'Usunięcie konta',
          body: 'Konto usuniesz w aplikacji: Profil → Konto → Usuń konto. Operacja wymaga potwierdzenia nazwy użytkownika i ponownego uwierzytelnienia. Jest nieodwracalna: usuwamy konto Auth, profil, relacje, zaproszenia, wiadomości, związane pliki Storage i lokalne kolejki aplikacji. Jeżeli nie masz dostępu do aplikacji, napisz na kontakt@damianmotylinski.pl.',
        },
        {
          title: 'Dzieci i zmiany dokumentu',
          body: 'Usługa jest dostępna od 16. roku życia. Data urodzenia służy lokalnie wyłącznie do sprawdzenia progu i nie jest zapisywana; zachowujemy wersjonowane potwierdzenie 16+. O istotnej zmianie polityki poinformujemy przed jej wejściem w życie.',
        },
      ],
    },
    terms: {
      version: '2026-09-05',
      effectiveDate: '5 września 2026 r.',
      sections: [
        { title: 'Usługodawca', body: 'Usługę NiX świadczy MT Hub Damian Motyliński, ul. ks. Józefa Poniatowskiego 27a lok. 2, 76-200 Słupsk, NIP 8393229228. Kontakt: kontakt@damianmotylinski.pl.' },
        { title: 'Usługa', body: 'NiX umożliwia zaakceptowanym znajomym wymianę efemerycznych wiadomości tekstowych, zdjęciowych i wideo. Do korzystania wymagane są kompatybilne urządzenie, dostęp do Internetu oraz konto.' },
        { title: 'Konto', body: 'Musisz mieć ukończone 16 lat, potwierdzić ten próg, podać prawdziwe dane wymagane przy rejestracji i chronić dostęp do konta. Konto e-mail i konto Apple mogą być odrębne. Nazwy użytkownika nie można zmienić po jej ustawieniu.' },
        { title: 'Treści użytkownika', body: 'Zachowujesz prawa do własnych treści. Udzielasz nam wyłącznie niewyłącznego, nieodpłatnego upoważnienia technicznego koniecznego do hostowania, przetworzenia i doręczenia treści wybranemu odbiorcy.' },
        { title: 'Zakazane działania', body: 'Nie wolno przesyłać treści bez prawa do ich użycia, niezgodnych z prawem, naruszających cudzą prywatność, dobra osobiste, prawa autorskie lub bezpieczeństwo. Zakazane jest nękanie, podszywanie się, obchodzenie zabezpieczeń i zakłócanie działania usługi.' },
        { title: 'Bezpieczeństwo i moderacja', body: 'Odbiorca może zgłosić wiadomość i zablokować nadawcę. Możemy ostrzec, czasowo zawiesić lub zablokować konto dla bezpieczeństwa, ochrony innych osób lub zgodności z prawem. Odwołanie wyślij na kontakt@damianmotylinski.pl.' },
        { title: 'Dostępność', body: 'Usługa jest świadczona w modelu „as is” i może być czasowo niedostępna z powodu konserwacji, aktualizacji lub zdarzeń niezależnych. Nie gwarantujemy zachowania wiadomości po zakończeniu ich cyklu efemerycznego.' },
        { title: 'Reklamacje i rozwiązanie umowy', body: 'Reklamacje wyślij na kontakt@damianmotylinski.pl wraz z opisem problemu. Odpowiemy w terminie przewidzianym przez prawo. Możesz rozwiązać umowę przez usunięcie konta w aplikacji; usunięcie jest nieodwracalne.' },
        { title: 'Zmiany regulaminu i prawo', body: 'O istotnej zmianie regulaminu poinformujemy przed jej wejściem w życie. Stosuje się prawo polskie z zachowaniem bezwzględnie obowiązujących praw konsumenta.' },
      ],
    },
  },
  en: {
    privacy: {
      version: '2026-09-05',
      effectiveDate: '5 September 2026',
      sections: [
        {
          title: 'Controller and contact',
          body: 'The controller is MT Hub Damian Motyliński, ul. ks. Józefa Poniatowskiego 27a lok. 2, 76-200 Słupsk, Poland, tax ID 8393229228. Contact us about privacy at kontakt@damianmotylinski.pl. You may lodge a complaint with the competent data-protection authority (in Poland: the President of the Personal Data Protection Office).',
        },
        {
          title: 'Data we process',
          body: 'We process email and authentication data, account ID, username, display name, profile bio, avatar, friend relationships, QR invitations, confirmation of being 16+ without storing date of birth, blocks, abuse reports, screen-capture preferences, text and media message content and metadata, notification token, app-installation identifier, device model, iOS and app versions, app language, private conversation read state, and technical logs.',
        },
        {
          title: 'Purposes and legal bases',
          body: 'We process data to create and operate the account and deliver messages under performance of a contract (GDPR Article 6(1)(b)); for security, fraud prevention and defence of claims under legitimate interests (Article 6(1)(f)); and to comply with law where required (Article 6(1)(c)).',
        },
        {
          title: 'Push notifications',
          body: 'Push notifications are optional and can be disabled independently on each device in Profile or iOS Settings. A notification may contain a username and event type, but never includes a message photo, video, or thumbnail.',
        },
        {
          title: 'Optional product analytics',
          body: 'With separate, optional consent we may collect limited product-analytics events: an installation identifier, an allowlisted event name, app version, language, time, and restricted properties. Events do not contain message content, usernames, media paths, or tokens. The installation ID can be linked to your account via installation and push tables (this is not anonymous analytics). Before consent, the client does not send events. You may refuse consent during onboarding and withdraw it anytime in Profile → Privacy & security. In the current public candidate, product analytics is build-flag disabled.',
        },
        {
          title: 'Device permissions',
          body: 'Camera, microphone and photo-library access is used only after iOS permission: to create photo/video messages and set an avatar. You can refuse or withdraw permission in device settings, but that feature will not work.',
        },
        {
          title: 'Messages and privacy',
          body: 'Messages are available only to their selected recipient. After viewing, the app attempts to remove the media file. A technical message record may remain only as long as necessary to complete deletion and resolve errors. Screenshot blocking is a system feature and is not an absolute guarantee.',
        },
        {
          title: 'Recipients',
          body: 'Data may be processed by Supabase (authentication, database, Storage and server functions in the EU), Apple (Sign in with Apple and App Store), and Expo/EAS (builds, distribution and push notifications), only as needed. The installed Sentry SDK is hard-disabled in the public build and receives no data until an explicit release decision turns it on.',
        },
        {
          title: 'International transfers',
          body: 'If a provider processes data outside the EEA, we use an appropriate legal transfer mechanism under GDPR Chapter V, such as an adequacy decision or standard contractual clauses. Contact us for current details.',
        },
        {
          title: 'Retention',
          body: 'Account, profile, and age confirmation remain until account deletion. Active notification tokens remain until notifications are disabled, sign-out, account deletion, or the device is reported unregistered. Raw consented analytics events (when enabled) and technical notification-delivery history are retained up to 30 days; daily aggregates do not contain an installation identifier. Media is removed after viewing. Ephemeral text messages are deleted automatically 24 hours after sending. Report evidence is deleted after 30 days; resolved reports and decision audit after up to 365 days; technical logs after up to 30 days. Open reports remain until resolved.',
        },
        {
          title: 'Your rights',
          body: 'You may request access, rectification, erasure, restriction of processing, portability and objection where applicable, and lodge a complaint with the competent supervisory authority. Send requests to kontakt@damianmotylinski.pl.',
        },
        {
          title: 'Account deletion',
          body: 'Delete your account in the app: Profile → Account → Delete account. You must confirm your username and reauthenticate. The irreversible operation removes Auth, profile, relationships, invitations, messages, relevant Storage files and local app queues. Contact kontakt@damianmotylinski.pl if you cannot access the app.',
        },
        {
          title: 'Age and changes',
          body: 'The service is available from age 16. Date of birth is used locally only to check the threshold and is not stored; we retain a versioned 16+ confirmation. We announce material policy changes before they take effect.',
        },
      ],
    },
    terms: {
      version: '2026-09-05',
      effectiveDate: '5 September 2026',
      sections: [
        { title: 'Provider', body: 'NiX is provided by MT Hub Damian Motyliński, ul. ks. Józefa Poniatowskiego 27a lok. 2, 76-200 Słupsk, Poland, tax ID 8393229228. Contact: kontakt@damianmotylinski.pl.' },
        { title: 'Service', body: 'NiX enables accepted friends to exchange ephemeral text, photo, and video messages. Use requires a compatible device, Internet access and an account.' },
        { title: 'Account', body: 'You must be 16 or older, confirm that threshold, provide accurate registration data, and keep your account secure. Email and Apple accounts can be separate. A username cannot be changed once set.' },
        { title: 'Your content', body: 'You retain rights in your content and grant only the non-exclusive, royalty-free technical permission necessary to host, process and deliver it to the selected recipient.' },
        { title: 'Prohibited use', body: 'Do not send content you lack rights to use, unlawful content, or content that violates privacy, personality, copyright or safety. Harassment, impersonation, bypassing safeguards and disrupting the service are prohibited.' },
        { title: 'Safety and moderation', body: 'A recipient can report a message and block its sender. We may warn, suspend, or ban an account for safety, the rights of others, or legal compliance. Appeal at kontakt@damianmotylinski.pl.' },
        { title: 'Availability', body: 'The service is provided as is and can be temporarily unavailable because of maintenance, updates or events outside our control. We do not guarantee that messages remain available after their ephemeral lifecycle.' },
        { title: 'Complaints and termination', body: 'Send complaints with a description of the issue to kontakt@damianmotylinski.pl. You may end the agreement by deleting the account in the app; deletion is irreversible.' },
        { title: 'Changes and law', body: 'We announce material changes before they take effect. Polish law applies without limiting mandatory consumer protections.' },
      ],
    },
  },
};
