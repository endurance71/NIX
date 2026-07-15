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
      version: '2026-07-14',
      effectiveDate: '14 lipca 2026 r.',
      sections: [
        {
          title: 'Administrator danych i kontakt',
          body: 'Administratorem Twoich danych osobowych jest MT Hub Damian Motyliński, ul. ks. Józefa Poniatowskiego 27a lok. 2, 76-200 Słupsk, NIP 8393229228. W sprawach prywatności skontaktuj się z nami: kontakt@damianmotylinski.pl.',
        },
        {
          title: 'Jakie dane przetwarzamy',
          body: 'Przetwarzamy e-mail i dane uwierzytelniania, identyfikator konta, nazwę użytkownika, awatar, relacje znajomych, zaproszenia QR, ustawienia ochrony przechwytywania ekranu, treść i metadane wiadomości zdjęciowych oraz wideo, a także techniczne logi przesyłania.',
        },
        {
          title: 'Cele i podstawy prawne',
          body: 'Dane są potrzebne do założenia i prowadzenia konta oraz dostarczenia wiadomości — wykonanie umowy (art. 6 ust. 1 lit. b RODO). Przetwarzamy je również dla bezpieczeństwa, zapobiegania nadużyciom i obrony roszczeń — uzasadniony interes administratora (art. 6 ust. 1 lit. f RODO), a gdy jest to wymagane — dla obowiązku prawnego (art. 6 ust. 1 lit. c RODO).',
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
          body: 'Dane mogą być przetwarzane przez Supabase (uwierzytelnianie, baza danych, Storage i funkcje serwerowe, region UE), Apple (Sign in with Apple i App Store) oraz Expo/EAS (budowanie i aktualizowanie aplikacji). Korzystamy z podmiotów przetwarzających wyłącznie w zakresie niezbędnym do działania usługi.',
        },
        {
          title: 'Transfery poza EOG',
          body: 'Jeżeli dostawca przetwarza dane poza Europejskim Obszarem Gospodarczym, transfer odbywa się wyłącznie z zastosowaniem odpowiedniego mechanizmu prawnego, w tym decyzji stwierdzającej odpowiedni stopień ochrony lub standardowych klauzul umownych. Aktualną informację otrzymasz pod adresem kontaktowym.',
        },
        {
          title: 'Okres przechowywania',
          body: 'Dane konta przechowujemy do usunięcia konta. Media usuwamy po odczycie zgodnie z funkcją produktu. Techniczne logi przesyłania i audyt czyszczenia przechowujemy tylko przez okres konieczny do bezpieczeństwa i usuwania błędów, nie dłużej niż 30 dni, chyba że dłuższy okres jest wymagany prawem.',
        },
        {
          title: 'Twoje prawa',
          body: 'Masz prawo żądać dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, przenoszenia oraz sprzeciwu — gdy ma zastosowanie. Możesz też złożyć skargę do Prezesa Urzędu Ochrony Danych Osobowych. Wnioski wyślij na kontakt@damianmotylinski.pl.',
        },
        {
          title: 'Usunięcie konta',
          body: 'Konto usuniesz w tej polityce, wybierając „Usuń konto”. Operacja wymaga potwierdzenia nazwy użytkownika i ponownego uwierzytelnienia. Jest nieodwracalna: usuwamy konto Auth, profil, relacje, zaproszenia, wiadomości, związane pliki Storage i lokalne kolejki aplikacji. Jeżeli nie masz dostępu do aplikacji, napisz do nas.',
        },
        {
          title: 'Dzieci i zmiany dokumentu',
          body: 'Usługa nie jest kierowana do osób poniżej 16. roku życia. Nie zbieramy świadomie ich danych. O istotnej zmianie polityki poinformujemy w aplikacji przed jej wejściem w życie; przy zmianie wymagającej nowej akceptacji poprosimy o nią osobno.',
        },
      ],
    },
    terms: {
      version: '2026-07-14',
      effectiveDate: '14 lipca 2026 r.',
      sections: [
        { title: 'Usługodawca', body: 'Usługę NiX świadczy MT Hub Damian Motyliński, ul. ks. Józefa Poniatowskiego 27a lok. 2, 76-200 Słupsk, NIP 8393229228. Kontakt: kontakt@damianmotylinski.pl.' },
        { title: 'Usługa', body: 'NiX umożliwia zaakceptowanym znajomym wymianę efemerycznych wiadomości zdjęciowych i wideo. Do korzystania wymagane są kompatybilne urządzenie, dostęp do Internetu oraz konto.' },
        { title: 'Konto', body: 'Podajesz prawdziwe dane wymagane przy rejestracji i chronisz dostęp do konta. Konto e-mail i konto Apple mogą być odrębnymi kontami. Nazwy użytkownika nie można zmienić po jej ustawieniu.' },
        { title: 'Treści użytkownika', body: 'Zachowujesz prawa do własnych treści. Udzielasz nam wyłącznie niewyłącznego, nieodpłatnego upoważnienia technicznego koniecznego do hostowania, przetworzenia i doręczenia treści wybranemu odbiorcy.' },
        { title: 'Zakazane działania', body: 'Nie wolno przesyłać treści bez prawa do ich użycia, niezgodnych z prawem, naruszających cudzą prywatność, dobra osobiste, prawa autorskie lub bezpieczeństwo. Zakazane jest nękanie, podszywanie się, obchodzenie zabezpieczeń i zakłócanie działania usługi.' },
        { title: 'Bezpieczeństwo i moderacja', body: 'Możemy ograniczyć dostęp do konta, jeżeli jest to konieczne dla bezpieczeństwa, ochrony innych osób lub zgodności z prawem. W miarę możliwości podamy przyczynę i sposób kontaktu w sprawie decyzji.' },
        { title: 'Dostępność', body: 'Usługa jest świadczona w modelu „as is” i może być czasowo niedostępna z powodu konserwacji, aktualizacji lub zdarzeń niezależnych. Nie gwarantujemy zachowania wiadomości po zakończeniu ich cyklu efemerycznego.' },
        { title: 'Reklamacje i rozwiązanie umowy', body: 'Reklamacje wyślij na kontakt@damianmotylinski.pl wraz z opisem problemu. Odpowiemy w terminie przewidzianym przez prawo. Możesz rozwiązać umowę przez usunięcie konta w aplikacji; usunięcie jest nieodwracalne.' },
        { title: 'Zmiany regulaminu i prawo', body: 'O istotnej zmianie regulaminu poinformujemy przed jej wejściem w życie. Stosuje się prawo polskie z zachowaniem bezwzględnie obowiązujących praw konsumenta.' },
      ],
    },
  },
  en: {
    privacy: {
      version: '2026-07-14',
      effectiveDate: '14 July 2026',
      sections: [
        { title: 'Controller and contact', body: 'The controller is MT Hub Damian Motyliński, ul. ks. Józefa Poniatowskiego 27a lok. 2, 76-200 Słupsk, Poland, tax ID 8393229228. Contact us about privacy at kontakt@damianmotylinski.pl.' },
        { title: 'Data we process', body: 'We process email and authentication data, account ID, username, avatar, friend relationships, QR invitations, screen-capture preferences, photo and video message content and metadata, and technical upload logs.' },
        { title: 'Purposes and legal bases', body: 'We process data to create and operate the account and deliver messages under performance of a contract (GDPR Article 6(1)(b)); for security, fraud prevention and defence of claims under legitimate interests (Article 6(1)(f)); and to comply with law where required (Article 6(1)(c)).' },
        { title: 'Device permissions', body: 'Camera, microphone and photo-library access is used only after iOS permission: to create photo/video messages and set an avatar. You can refuse or withdraw permission in device settings, but that feature will not work.' },
        { title: 'Messages and privacy', body: 'Messages are available only to their selected recipient. After viewing, the app attempts to remove the media file. A technical message record may remain only as long as necessary to complete deletion and resolve errors. Screenshot blocking is a system feature and is not an absolute guarantee.' },
        { title: 'Recipients', body: 'Data may be processed by Supabase (authentication, database, Storage and server functions in the EU), Apple (Sign in with Apple and App Store), and Expo/EAS (building and updating the app), only to the extent needed to operate the service.' },
        { title: 'International transfers', body: 'If a provider processes data outside the EEA, we use an appropriate legal transfer mechanism, such as an adequacy decision or standard contractual clauses. Contact us for current details.' },
        { title: 'Retention', body: 'We retain account data until account deletion. We remove media after viewing. Technical upload logs and cleanup audit data are kept only as needed for security and fault resolution, for no longer than 30 days unless law requires otherwise.' },
        { title: 'Your rights', body: 'You may request access, rectification, erasure, restriction, portability and objection where applicable, and lodge a complaint with the competent supervisory authority. Send requests to kontakt@damianmotylinski.pl.' },
        { title: 'Account deletion', body: 'Select “Delete account” in this policy. You must confirm your username and reauthenticate. The irreversible operation removes Auth, profile, relationships, invitations, messages, relevant Storage files and local app queues. Contact us if you cannot access the app.' },
        { title: 'Children and changes', body: 'The service is not directed to children under 16 and we do not knowingly collect their data. We announce material policy changes in the app before they take effect and request new acceptance where needed.' },
      ],
    },
    terms: {
      version: '2026-07-14',
      effectiveDate: '14 July 2026',
      sections: [
        { title: 'Provider', body: 'NiX is provided by MT Hub Damian Motyliński, ul. ks. Józefa Poniatowskiego 27a lok. 2, 76-200 Słupsk, Poland, tax ID 8393229228. Contact: kontakt@damianmotylinski.pl.' },
        { title: 'Service', body: 'NiX enables accepted friends to exchange ephemeral photo and video messages. Use requires a compatible device, Internet access and an account.' },
        { title: 'Account', body: 'Provide accurate registration data and keep your account secure. An email account and Apple account can be separate accounts. A username cannot be changed once set.' },
        { title: 'Your content', body: 'You retain rights in your content and grant only the non-exclusive, royalty-free technical permission necessary to host, process and deliver it to the selected recipient.' },
        { title: 'Prohibited use', body: 'Do not send content you lack rights to use, unlawful content, or content that violates privacy, personality, copyright or safety. Harassment, impersonation, bypassing safeguards and disrupting the service are prohibited.' },
        { title: 'Safety and moderation', body: 'We may restrict an account when necessary for safety, the rights of others or legal compliance. Where possible, we provide the reason and a way to contact us about the decision.' },
        { title: 'Availability', body: 'The service is provided as is and can be temporarily unavailable because of maintenance, updates or events outside our control. We do not guarantee that messages remain available after their ephemeral lifecycle.' },
        { title: 'Complaints and termination', body: 'Send complaints with a description of the issue to kontakt@damianmotylinski.pl. You may end the agreement by deleting the account in the app; deletion is irreversible.' },
        { title: 'Changes and law', body: 'We announce material changes before they take effect. Polish law applies without limiting mandatory consumer protections.' },
      ],
    },
  },
};
