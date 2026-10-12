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
      version: '2026-10-12',
      effectiveDate: '12 października 2026 r.',
      sections: [
        {
          title: '§ 1. Postanowienia ogólne',
          body: '1. Niniejsza Polityka prywatności (dalej: „Polityka”) określa zasady przetwarzania danych osobowych Użytkowników aplikacji mobilnej NiX (dalej: „Aplikacja”) oraz strony internetowej nix.shipapp.pl (dalej: „Strona”), zgodnie z rozporządzeniem Parlamentu Europejskiego i Rady (UE) 2016/679 z dnia 27 kwietnia 2016 r. (dalej: „RODO”).\n2. Użyte w Polityce pojęcia oznaczają: „Użytkownik” — osobę fizyczną korzystającą z Aplikacji lub Strony; „Konto” — konto Użytkownika w Aplikacji; „Wiadomość” — wiadomość tekstową lub głosową; „NiX” — zdjęcie lub nagranie wideo przesłane w Aplikacji; „Znajomy” — Użytkownika, którego zaproszenie do grona znajomych zostało przyjęte.\n3. NiX jest marką ShipApp. Usługa jest przeznaczona dla osób, które ukończyły 16 lat.',
        },
        {
          title: '§ 2. Administrator danych',
          body: '1. Administratorem danych osobowych jest MT Hub Damian Motyliński, ul. ks. Józefa Poniatowskiego 27a lok. 2, 76-200 Słupsk, NIP 8393229228 (dalej: „Administrator”).\n2. We wszystkich sprawach dotyczących przetwarzania danych osobowych oraz realizacji praw Użytkownika można kontaktować się z Administratorem pod adresem e-mail: nix@shipapp.pl.\n3. Administrator nie wyznaczył inspektora ochrony danych.',
        },
        {
          title: '§ 3. Kategorie przetwarzanych danych',
          body: '1. Administrator przetwarza następujące kategorie danych osobowych:\na) dane Konta: adres e-mail, dane uwierzytelniające (hasło w postaci zabezpieczonej albo identyfikator usługi „Zaloguj się przez Apple”), identyfikator Konta, potwierdzenie ukończenia 16 lat oraz informacja o akceptacji Regulaminu i Polityki;\nb) dane profilu i relacji: nazwa użytkownika, nazwa wyświetlana, opis profilu, awatar, ustawienie konta prywatnego, lista Znajomych, zaproszenia oraz blokady;\nc) treści i metadane komunikacji: treść Wiadomości, nagrania głosowe, NiX-y, reakcje, odpowiedzi, przekazania, oznaczenia zapisania, poprzednie wersje edytowanych Wiadomości, czas wyświetlania NiX-a oraz statusy doręczenia i otwarcia;\nd) dane o aktywności w rozmowach: dzienne liczniki wymiany wiadomości (serie i lista najlepszych znajomych), rozmowy przypięte i wyciszone oraz informacje o próbach utrwalenia NiX-a zrzutem ekranu lub nagraniem;\ne) dane dotyczące bezpieczeństwa: zgłoszenia, zabezpieczone dowody oraz decyzje moderacyjne;\nf) dane urządzenia: token powiadomień, nazwa i model urządzenia, wersja systemu iOS i Aplikacji, język oraz data ostatniej aktywności.\n2. Administrator nie przetwarza danych o lokalizacji, danych z książki adresowej urządzenia ani identyfikatora reklamowego.\n3. Podanie danych jest dobrowolne, lecz niezbędne do zawarcia i wykonania umowy o świadczenie usługi; bez ich podania korzystanie z Aplikacji nie jest możliwe.',
        },
        {
          title: '§ 4. Cele i podstawy prawne przetwarzania',
          body: '1. Dane osobowe są przetwarzane w celu:\na) zawarcia i wykonania umowy o świadczenie usługi, w tym prowadzenia Konta, nawiązywania relacji ze Znajomymi oraz doręczania Wiadomości i NiX-ów — na podstawie art. 6 ust. 1 lit. b RODO;\nb) zapewnienia bezpieczeństwa usługi, przeciwdziałania nadużyciom i treściom niedozwolonym, rozpatrywania zgłoszeń oraz ustalenia, dochodzenia lub obrony roszczeń — na podstawie prawnie uzasadnionego interesu Administratora (art. 6 ust. 1 lit. f RODO);\nc) wypełnienia obowiązków prawnych, w tym udzielania informacji uprawnionym organom — na podstawie art. 6 ust. 1 lit. c RODO.\n2. Administrator nie przetwarza danych w celach marketingowych, nie wyświetla reklam, nie sprzedaje danych osobowych i nie stosuje śledzenia w rozumieniu zasad App Store („App Tracking Transparency”).',
        },
        {
          title: '§ 5. Okresy dostępności Wiadomości i NiX-ów',
          body: '1. Wiadomości tekstowe i głosowe są automatycznie usuwane po upływie 24 godzin od ich wysłania.\n2. Każdy z uczestników rozmowy może oznaczyć Wiadomość jako zapisaną. Zapisana Wiadomość jest przechowywana do czasu cofnięcia zapisania przez któregokolwiek z uczestników (po czym zostaje usunięta po upływie 24 godzin) albo do usunięcia rozmowy.\n3. Plik zdjęcia lub nagrania wideo stanowiący NiX, wraz z jego miniaturą, jest usuwany z serwera około 10 minut po pierwszym wyświetleniu przez odbiorcę (okres umożliwiający ponowne odtworzenie). NiX niewyświetlony przez odbiorcę jest usuwany po upływie 30 dni od wysłania. Po usunięciu pliku w rozmowie pozostają wyłącznie metadane NiX-a, do czasu usunięcia rozmowy.\n4. Nadawca może edytować Wiadomość tekstową w ciągu 15 minut od wysłania (nie więcej niż pięciokrotnie) oraz cofnąć wysłanie Wiadomości w ciągu 5 minut. Poprzednie wersje edytowanej Wiadomości są przechowywane wraz z nią wyłącznie na potrzeby rozpatrzenia ewentualnego zgłoszenia i nie są udostępniane Użytkownikom.\n5. Przekazanie Wiadomości tworzy nową, odrębną Wiadomość, której okres dostępności liczy się od chwili jej wysłania.\n6. Usunięcie rozmowy powoduje usunięcie Wiadomości i NiX-ów danej pary Użytkowników po obu stronach. Zablokowanie Użytkownika powoduje ukrycie rozmowy oraz cofnięcie zapisania Wiadomości tej pary Użytkowników, które są następnie usuwane po upływie 24 godzin.',
        },
        {
          title: '§ 6. Ochrona przed utrwalaniem treści',
          body: '1. Zrzuty ekranu i nagrywanie ekranu podczas wyświetlania NiX-a są domyślnie blokowane, a o próbie ich wykonania nadawca jest powiadamiany.\n2. Nadawca może zezwolić wybranym Znajomym na zapisywanie swoich NiX-ów. W takim przypadku odbiorca może zapisać NiX w bibliotece zdjęć swojego urządzenia, a dalsze przetwarzanie tej kopii następuje poza Aplikacją i poza kontrolą Administratora.\n3. Ochrona, o której mowa w ust. 1, nie obejmuje Wiadomości tekstowych i głosowych oraz nie wyklucza utrwalenia treści za pomocą innego urządzenia.',
        },
        {
          title: '§ 7. Automatyczna kontrola treści i moderacja',
          body: '1. Przed doręczeniem odbiorcy treść Wiadomości tekstowych, zdjęcia oraz wybrane klatki nagrań wideo podlegają automatycznej kontroli z wykorzystaniem usługi Microsoft Azure AI Content Safety (centrum danych w Szwecji) oraz filtra słów niedozwolonych, wyłącznie w celu wykrycia treści niedozwolonych (mowa nienawiści, przemoc, samookaleczenia, treści o charakterze seksualnym). Treść zakwalifikowana jako niedozwolona nie jest doręczana. Kopia robocza wykorzystywana do kontroli jest usuwana po podjęciu decyzji, nie później niż po 24 godzinach.\n2. Nagrania głosowe oraz ścieżka dźwiękowa nagrań wideo nie podlegają automatycznej kontroli.\n3. Użytkownik może zgłosić Wiadomość, NiX lub profil innego Użytkownika. W związku ze zgłoszeniem Administrator zabezpiecza dowód (kopię zdjęcia, nagrania wideo lub nagrania głosowego albo treść Wiadomości wraz z jej poprzednimi wersjami) na okres 30 dni.\n4. Decyzje o usunięciu treści oraz o ograniczeniu lub zablokowaniu Konta podejmuje zespół moderacji Administratora. Zgłoszenia dotyczące bezpieczeństwa dzieci są rozpatrywane priorytetowo i — w zakresie wymaganym przepisami prawa — przekazywane właściwym organom.',
        },
        {
          title: '§ 8. Konto prywatne i wyszukiwanie Użytkowników',
          body: '1. Użytkownika można wyszukać wyłącznie po dokładnej nazwie użytkownika albo dodać za pomocą kodu QR (ważnego przez 5 minut) lub zaproszenia.\n2. Konto oznaczone jako prywatne nie jest wyświetlane w wynikach wyszukiwania, a zaproszenie do grona znajomych może zostać nawiązane wyłącznie z użyciem kodu lub zaproszenia udostępnionego przez jego właściciela.\n3. Aplikacja nie pobiera zawartości książki adresowej urządzenia i nie proponuje kontaktu z nieznanymi Użytkownikami.',
        },
        {
          title: '§ 9. Powiadomienia push',
          body: '1. Powiadomienia push są wysyłane wyłącznie za zgodą udzieloną w systemie iOS; Użytkownik może je wyłączyć w Aplikacji lub w ustawieniach systemu.\n2. Powiadomienie zawiera nazwę i awatar nadawcy oraz rodzaj zdarzenia; nie zawiera treści Wiadomości, zdjęcia ani nagrania. W celu prezentacji powiadomienia jako wiadomości system iOS może zapisać na urządzeniu nazwę i awatar nadawcy (np. na potrzeby sugestii Siri i trybów skupienia).\n3. Powiadomienie o próbie utrwalenia NiX-a jest wysyłane niezależnie od ustawień powiadomień o wiadomościach w Aplikacji.',
        },
        {
          title: '§ 10. Uprawnienia urządzenia',
          body: 'Aplikacja korzysta z aparatu, mikrofonu i biblioteki zdjęć wyłącznie po udzieleniu zgody w systemie iOS, w celu tworzenia zdjęć, nagrań wideo i nagrań głosowych, skanowania kodów QR, ustawienia awatara oraz zapisu w bibliotece zdjęć. Zgodę można w każdej chwili cofnąć w ustawieniach systemu, co uniemożliwia korzystanie z danej funkcji.',
        },
        {
          title: '§ 11. Dane przechowywane wyłącznie na urządzeniu',
          body: '1. Funkcja „Wspomnienia” przechowuje wysłane przez Użytkownika NiX-y wyłącznie na jego urządzeniu, w postaci zaszyfrowanej algorytmem AES-256 kluczem przechowywanym w pęku kluczy urządzenia. Dane te nie są przesyłane do Administratora ani obejmowane eksportem danych. Kopia zapasowa urządzenia zawiera wyłącznie zaszyfrowane pliki, których nie można odczytać na innym urządzeniu. Łączny rozmiar Wspomnień jest ograniczony do 500 MB, a po przekroczeniu limitu najstarsze pozycje są usuwane automatycznie.\n2. Na urządzeniu przechowywane są ponadto: zaszyfrowana pamięć podręczna odebranych zdjęć oczekujących na wyświetlenie, liczba nowych NiX-ów i postęp wysyłania prezentowane w widżecie i Live Activity (bez nazw i treści) oraz zdjęcia wykonane aparatem z ekranu blokady i pliki udostępnione z innych aplikacji — do czasu ich wysłania.\n3. Wylogowanie powoduje usunięcie z urządzenia Wspomnień wraz z kluczem, pamięci podręcznej oraz kolejki wysyłania.',
        },
        {
          title: '§ 12. Odbiorcy danych',
          body: '1. Dane osobowe są powierzane podmiotom przetwarzającym wyłącznie w zakresie niezbędnym do świadczenia usługi, na podstawie umów powierzenia przetwarzania:\na) Supabase Inc. — uwierzytelnianie, baza danych, przechowywanie plików i funkcje serwerowe (centrum danych w Irlandii);\nb) Microsoft Ireland Operations Ltd. (Azure AI Content Safety) — automatyczna kontrola treści (centrum danych w Szwecji);\nc) OVH SAS — serwer przygotowujący nagrania wideo do kontroli (Francja);\nd) Contabo GmbH — hosting Strony (Francja);\ne) Cloudflare, Inc. — dostarczanie i ochrona Strony;\nf) 650 Industries, Inc. (Expo) — dostarczanie powiadomień push i aktualizacji Aplikacji;\ng) Apple Inc. / Apple Distribution International Ltd. — usługa „Zaloguj się przez Apple”, dostarczanie powiadomień (APNs) i dystrybucja Aplikacji.\n2. Dane mogą zostać udostępnione organom państwowym wyłącznie na podstawie obowiązujących przepisów prawa.\n3. Narzędzia analityczne oraz raportowania błędów są w Aplikacji wyłączone. Strona nie wykorzystuje plików cookies ani narzędzi analitycznych.',
        },
        {
          title: '§ 13. Przekazywanie danych do państw trzecich',
          body: 'Dane osobowe Użytkowników są przechowywane na terytorium Europejskiego Obszaru Gospodarczego. W związku z korzystaniem z usług Expo, Apple i Cloudflare dane niezbędne do doręczenia powiadomień, uwierzytelnienia oraz obsługi Strony mogą być przekazywane do Stanów Zjednoczonych — na podstawie decyzji Komisji Europejskiej stwierdzającej odpowiedni stopień ochrony (EU–US Data Privacy Framework) lub standardowych klauzul umownych, zgodnie z rozdziałem V RODO. Kopię stosowanych zabezpieczeń można uzyskać, kontaktując się z Administratorem.',
        },
        {
          title: '§ 14. Okresy przechowywania danych',
          body: 'Dane osobowe są przechowywane przez okres:\na) dane Konta, profilu, relacji, blokad, potwierdzenia wieku, akceptacji dokumentów, rozmów przypiętych i wyciszonych oraz liczniki serii — do usunięcia Konta; dane urządzenia — do usunięcia Konta lub po upływie 180 dni bez aktywności;\nb) Wiadomości i NiX-y — zgodnie z § 5;\nc) kopie robocze wykorzystywane do automatycznej kontroli treści — do podjęcia decyzji, nie dłużej niż 24 godziny;\nd) dowody zabezpieczone w związku ze zgłoszeniem — 30 dni; rozstrzygnięte zgłoszenia — 365 dni od rozstrzygnięcia; decyzje moderacyjne dotyczące Kont — przez okres niezbędny do zapewnienia bezpieczeństwa usługi;\ne) historia doręczania powiadomień — 30 dni; token powiadomień jest usuwany z chwilą wylogowania lub usunięcia Konta, a po wyłączeniu powiadomień w Aplikacji pozostaje nieaktywny;\nf) archiwum eksportu danych — 24 godziny od jego przygotowania;\ng) metadane techniczne dotyczące przesyłania i usuwania multimediów — 30 dni; metadane automatycznej kontroli treści — 30 dni, a w przypadku treści zakwalifikowanych jako niedozwolone — 90 dni;\nh) dane przetwarzane dłużej, jeżeli jest to niezbędne do ustalenia, dochodzenia lub obrony roszczeń albo wymagają tego przepisy prawa — przez okres wynikający z tych podstaw.',
        },
        {
          title: '§ 15. Prawa Użytkownika',
          body: '1. Użytkownikowi przysługuje prawo dostępu do danych (art. 15 RODO), ich sprostowania (art. 16), usunięcia (art. 17), ograniczenia przetwarzania (art. 18), przenoszenia danych (art. 20) oraz wniesienia sprzeciwu wobec przetwarzania opartego na prawnie uzasadnionym interesie Administratora (art. 21 RODO).\n2. Kopię swoich danych Użytkownik może pobrać samodzielnie w Aplikacji: Profil → Prywatność i bezpieczeństwo → Eksport danych. Pozostałe żądania należy kierować na adres nix@shipapp.pl. Administrator udziela odpowiedzi bez zbędnej zwłoki, nie później niż w terminie miesiąca od otrzymania żądania.\n3. Użytkownikowi przysługuje prawo wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych (ul. Stawki 2, 00-193 Warszawa).',
        },
        {
          title: '§ 16. Usunięcie Konta',
          body: '1. Użytkownik może usunąć Konto w Aplikacji: Profil → Konto → Usuń konto, po potwierdzeniu nazwy użytkownika i ponownym uwierzytelnieniu. W przypadku Konta założonego z użyciem usługi „Zaloguj się przez Apple” Administrator unieważnia również dostęp Aplikacji do identyfikatora Apple ID Użytkownika.\n2. Usunięcie Konta powoduje usunięcie danych Konta, profilu, relacji, Wiadomości, NiX-ów, nagrań głosowych, awatara oraz eksportów danych. Pliki współdzielone z innymi Użytkownikami są usuwane z serwera w ciągu kilku minut. Zachowywane są wyłącznie dowody zabezpieczone w związku ze zgłoszeniami (do upływu okresu, o którym mowa w § 14 lit. d) oraz rozstrzygnięcia zgłoszeń i decyzje moderacyjne bez powiązania z usuniętym Kontem.\n3. Wylogowanie lub usunięcie Aplikacji z urządzenia nie powoduje usunięcia Konta. Użytkownik pozbawiony dostępu do Aplikacji może złożyć żądanie usunięcia Konta na adres nix@shipapp.pl z adresu e-mail przypisanego do Konta.',
        },
        {
          title: '§ 17. Zautomatyzowane podejmowanie decyzji',
          body: 'Administrator nie podejmuje wobec Użytkowników decyzji opartych wyłącznie na zautomatyzowanym przetwarzaniu, w tym profilowaniu, które wywoływałyby skutki prawne lub w podobny sposób istotnie na nich wpływały w rozumieniu art. 22 RODO. Automatyczna kontrola treści, o której mowa w § 7, dotyczy wyłącznie doręczenia konkretnej treści; ograniczenie lub zablokowanie Konta następuje na podstawie decyzji zespołu moderacji.',
        },
        {
          title: '§ 18. Osoby małoletnie',
          body: 'Usługa jest przeznaczona dla osób, które ukończyły 16 lat. Data urodzenia jest weryfikowana wyłącznie na urządzeniu i nie jest zapisywana; Administrator przechowuje jedynie potwierdzenie ukończenia 16 lat. W przypadku uzyskania informacji, że z usługi korzysta osoba, która nie ukończyła 16 lat, Administrator usuwa jej Konto.',
        },
        {
          title: '§ 19. Zmiany Polityki',
          body: 'Administrator może zmienić Politykę w szczególności w razie zmiany przepisów prawa lub funkcjonalności usługi. O istotnych zmianach Użytkownicy są informowani w Aplikacji przed ich wejściem w życie. Aktualna wersja Polityki jest dostępna w Aplikacji oraz na Stronie.',
        },
      ],
    },
    terms: {
      version: '2026-10-12',
      effectiveDate: '12 października 2026 r.',
      sections: [
        { title: 'Usługodawca', body: 'NiX jest marką ShipApp. Usługę świadczy MT Hub Damian Motyliński, ul. ks. Józefa Poniatowskiego 27a lok. 2, 76-200 Słupsk, NIP 8393229228. Kontakt: nix@shipapp.pl.' },
        { title: 'Usługa', body: 'NiX umożliwia zaakceptowanym znajomym wymianę efemerycznych wiadomości tekstowych, głosowych, zdjęciowych i wideo. Do korzystania wymagane są kompatybilne urządzenie, dostęp do Internetu oraz konto.' },
        { title: 'Konto', body: 'Musisz mieć ukończone 16 lat, potwierdzić ten próg, podać prawdziwe dane wymagane przy rejestracji i chronić dostęp do konta. Konto e-mail i konto Apple mogą być odrębne. Nazwy użytkownika nie można zmienić po jej ustawieniu.' },
        { title: 'Treści użytkownika', body: 'Zachowujesz prawa do własnych treści. Udzielasz nam wyłącznie niewyłącznego, nieodpłatnego upoważnienia technicznego koniecznego do hostowania, przetworzenia i doręczenia treści wybranemu odbiorcy.' },
        { title: 'Zakazane działania', body: 'Nie wolno przesyłać treści bez prawa do ich użycia, niezgodnych z prawem, naruszających cudzą prywatność, dobra osobiste, prawa autorskie lub bezpieczeństwo. Zakazane jest nękanie, podszywanie się, obchodzenie zabezpieczeń i zakłócanie działania usługi. Wobec treści niedozwolonych i nadużyć obowiązuje zero tolerancji: usuwamy je i możemy trwale zablokować konto.' },
        { title: 'Bezpieczeństwo i moderacja', body: 'Przed doręczeniem automatycznie skanujemy tekst, zdjęcia i wideo (dla wideo: wybrane klatki) przez Microsoft Azure AI Content Safety, żeby zablokować treści niedozwolone. Kopię roboczą skanu usuwamy po decyzji. Odbiorca może zgłosić wiadomość i zablokować nadawcę. Możemy ostrzec, czasowo zawiesić lub zablokować konto dla bezpieczeństwa, ochrony innych osób lub zgodności z prawem. Odwołanie wyślij na nix@shipapp.pl.' },
        { title: 'Dostępność', body: 'Usługa jest świadczona w modelu „as is” i może być czasowo niedostępna z powodu konserwacji, aktualizacji lub zdarzeń niezależnych. Nie gwarantujemy zachowania wiadomości po zakończeniu ich cyklu efemerycznego.' },
        { title: 'Reklamacje i rozwiązanie umowy', body: 'Reklamacje wyślij na nix@shipapp.pl wraz z opisem problemu. Odpowiemy w terminie przewidzianym przez prawo. Możesz rozwiązać umowę przez usunięcie konta w aplikacji; usunięcie jest nieodwracalne.' },
        { title: 'Zmiany regulaminu i prawo', body: 'O istotnej zmianie regulaminu poinformujemy przed jej wejściem w życie. Stosuje się prawo polskie z zachowaniem bezwzględnie obowiązujących praw konsumenta.' },
      ],
    },
  },
  en: {
    privacy: {
      version: '2026-10-12',
      effectiveDate: '12 October 2026',
      sections: [
        {
          title: '1. General provisions',
          body: '1. This Privacy Policy (the “Policy”) sets out how personal data of users of the NiX mobile application (the “App”) and of the website nix.shipapp.pl (the “Website”) is processed, in accordance with Regulation (EU) 2016/679 of the European Parliament and of the Council of 27 April 2016 (the “GDPR”).\n2. In this Policy: “User” means a natural person using the App or the Website; “Account” means a User\'s account in the App; “Message” means a text or voice message; “NiX” means a photo or video sent in the App; “Friend” means a User whose friend invitation has been accepted.\n3. NiX is a ShipApp brand. The service is intended for persons aged 16 and over.',
        },
        {
          title: '2. Controller',
          body: '1. The controller of personal data is MT Hub Damian Motyliński, ul. ks. Józefa Poniatowskiego 27a lok. 2, 76-200 Słupsk, Poland, tax ID (NIP) 8393229228 (the “Controller”).\n2. For all matters relating to the processing of personal data and the exercise of Users\' rights, the Controller can be contacted at nix@shipapp.pl.\n3. The Controller has not appointed a data protection officer.',
        },
        {
          title: '3. Categories of personal data',
          body: '1. The Controller processes the following categories of personal data:\na) Account data: email address, authentication data (a protected password or the Sign in with Apple identifier), Account identifier, confirmation of being aged 16 or over, and acceptance of the Terms and this Policy;\nb) profile and relationship data: username, display name, profile bio, avatar, private-account setting, Friends, invitations and blocks;\nc) communication content and metadata: Message content, voice recordings, NiXes, reactions, replies, forwards, save markers, earlier versions of edited Messages, NiX view time, and delivery and opened status;\nd) conversation activity data: daily exchange counters (streaks and best friends), pinned and muted conversations, and attempts to capture a NiX by screenshot or screen recording;\ne) safety data: reports, secured evidence and moderation decisions;\nf) device data: notification token, device name and model, iOS and App version, language and date of last activity.\n2. The Controller does not process location data, the device address book or advertising identifiers.\n3. Providing data is voluntary but necessary to conclude and perform the service agreement; without it the App cannot be used.',
        },
        {
          title: '4. Purposes and legal bases',
          body: '1. Personal data is processed for the purposes of:\na) concluding and performing the service agreement, including maintaining the Account, connecting Friends and delivering Messages and NiXes — Art. 6(1)(b) GDPR;\nb) ensuring the security of the service, preventing abuse and prohibited content, handling reports, and establishing, exercising or defending legal claims — the Controller\'s legitimate interest (Art. 6(1)(f) GDPR);\nc) complying with legal obligations, including providing information to competent authorities — Art. 6(1)(c) GDPR.\n2. The Controller does not process data for marketing purposes, does not display advertising, does not sell personal data and does not engage in tracking within the meaning of the App Store App Tracking Transparency rules.',
        },
        {
          title: '5. Availability of Messages and NiXes',
          body: '1. Text and voice Messages are deleted automatically 24 hours after they are sent.\n2. Either participant in a conversation may mark a Message as saved. A saved Message is kept until either participant removes the save (after which it is deleted 24 hours later) or until the conversation is deleted.\n3. The photo or video file of a NiX, together with its thumbnail, is deleted from the server approximately 10 minutes after the recipient first views it (the replay period). A NiX not viewed by its recipient is deleted 30 days after sending. Once the file is deleted, only the NiX\'s metadata remains in the conversation until the conversation is deleted.\n4. The sender may edit a text Message within 15 minutes of sending (no more than five times) and undo sending within 5 minutes. Earlier versions of an edited Message are kept with it solely for the purpose of handling any report and are not made available to Users.\n5. Forwarding a Message creates a new, separate Message whose availability period runs from the time it is sent.\n6. Deleting a conversation deletes the Messages and NiXes of that pair of Users for both participants. Blocking a User hides the conversation and removes the save marker from that pair\'s Messages, which are then deleted 24 hours later.',
        },
        {
          title: '6. Protection against capture',
          body: '1. Screenshots and screen recordings are blocked by default while a NiX is displayed, and the sender is notified of any attempt.\n2. The sender may allow selected Friends to save their NiXes. In that case the recipient may save the NiX to their device\'s photo library, and any further processing of that copy takes place outside the App and outside the Controller\'s control.\n3. The protection described in paragraph 1 does not cover text and voice Messages and does not prevent content being captured with another device.',
        },
        {
          title: '7. Automated content checks and moderation',
          body: '1. Before delivery to the recipient, the text of Messages, photos and selected frames of videos are checked automatically using Microsoft Azure AI Content Safety (data centre in Sweden) and a blocked-words filter, solely to detect prohibited content (hate, violence, self-harm and sexual content). Content classified as prohibited is not delivered. The working copy used for the check is deleted once a decision is made, and no later than after 24 hours.\n2. Voice recordings and the audio track of videos are not subject to automated checks.\n3. A User may report a Message, NiX or profile of another User. In connection with a report, the Controller secures evidence (a copy of the photo, video or voice recording, or the Message text with its earlier versions) for 30 days.\n4. Decisions to remove content and to restrict or suspend an Account are taken by the Controller\'s moderation team. Reports concerning child safety are handled as a priority and, to the extent required by law, passed to the competent authorities.',
        },
        {
          title: '8. Private accounts and user search',
          body: '1. A User can be found only by their exact username, or added with a QR code (valid for 5 minutes) or an invitation.\n2. An Account marked as private does not appear in search results, and a friend connection with it can only be established using a code or invitation shared by its owner.\n3. The App does not access the device address book and does not suggest contact with unknown Users.',
        },
        {
          title: '9. Push notifications',
          body: '1. Push notifications are sent only with the permission granted in iOS; the User may turn them off in the App or in the system settings.\n2. A notification contains the sender\'s name and avatar and the type of event; it does not contain the Message content, photo or video. To present a notification as a message, iOS may store the sender\'s name and avatar on the device (for example for Siri suggestions and Focus).\n3. A notification about an attempt to capture a NiX is sent regardless of the App\'s message-notification settings.',
        },
        {
          title: '10. Device permissions',
          body: 'The App uses the camera, microphone and photo library only after permission is granted in iOS, in order to take photos, videos and voice recordings, scan QR codes, set an avatar and save to the photo library. Permission may be withdrawn at any time in the system settings, which makes the related feature unavailable.',
        },
        {
          title: '11. Data stored only on the device',
          body: '1. The “Memories” feature stores NiXes sent by the User only on their device, encrypted with AES-256 using a key held in the device Keychain. This data is not transmitted to the Controller and is not included in the data export. A device backup contains only encrypted files that cannot be read on another device. Memories are limited to 500 MB in total, and once the limit is exceeded the oldest items are deleted automatically.\n2. The device also stores: an encrypted cache of received photos awaiting viewing; the number of new NiXes and upload progress shown in the widget and Live Activity (without names or content); and photos taken with the Lock Screen camera and files shared from other apps, until they are sent.\n3. Signing out deletes Memories together with their key, the cache and the send queue from the device.',
        },
        {
          title: '12. Recipients of data',
          body: '1. Personal data is entrusted to processors only to the extent necessary to provide the service, under data processing agreements:\na) Supabase Inc. — authentication, database, file storage and server functions (data centre in Ireland);\nb) Microsoft Ireland Operations Ltd. (Azure AI Content Safety) — automated content checks (data centre in Sweden);\nc) OVH SAS — a server preparing videos for checking (France);\nd) Contabo GmbH — Website hosting (France);\ne) Cloudflare, Inc. — Website delivery and protection;\nf) 650 Industries, Inc. (Expo) — delivery of push notifications and App updates;\ng) Apple Inc. / Apple Distribution International Ltd. — Sign in with Apple, notification delivery (APNs) and App distribution.\n2. Data may be disclosed to public authorities only on the basis of applicable law.\n3. Analytics and crash-reporting tools are disabled in the App. The Website does not use cookies or analytics tools.',
        },
        {
          title: '13. Transfers to third countries',
          body: 'Users\' personal data is stored within the European Economic Area. In connection with the use of Expo, Apple and Cloudflare, data necessary to deliver notifications, authenticate Users and operate the Website may be transferred to the United States — on the basis of the European Commission\'s adequacy decision (EU–US Data Privacy Framework) or standard contractual clauses, in accordance with Chapter V GDPR. A copy of the safeguards applied may be obtained from the Controller.',
        },
        {
          title: '14. Retention periods',
          body: 'Personal data is kept for the following periods:\na) Account, profile, relationship, block, age-confirmation and document-acceptance data, pinned and muted conversations and streak counters — until the Account is deleted; device data — until the Account is deleted or after 180 days of inactivity;\nb) Messages and NiXes — in accordance with section 5;\nc) working copies used for automated content checks — until a decision is made, no longer than 24 hours;\nd) evidence secured in connection with a report — 30 days; resolved reports — 365 days from resolution; moderation decisions concerning Accounts — for as long as necessary to keep the service secure;\ne) notification delivery history — 30 days; the notification token is deleted on sign-out or Account deletion, and remains inactive when notifications are turned off in the App;\nf) data export archives — 24 hours from preparation;\ng) technical metadata concerning media uploads and deletion — 30 days; metadata of automated content checks — 30 days, or 90 days for content classified as prohibited;\nh) data kept for longer where necessary to establish, exercise or defend legal claims or where required by law — for the period resulting from those grounds.',
        },
        {
          title: '15. Users\' rights',
          body: '1. Users have the right of access (Art. 15 GDPR), rectification (Art. 16), erasure (Art. 17), restriction of processing (Art. 18), data portability (Art. 20) and to object to processing based on the Controller\'s legitimate interest (Art. 21 GDPR).\n2. Users can download a copy of their data themselves in the App: Profile → Privacy & security → Data export. Other requests should be sent to nix@shipapp.pl. The Controller responds without undue delay and in any event within one month of receiving the request.\n3. Users have the right to lodge a complaint with the President of the Personal Data Protection Office (Prezes UODO, ul. Stawki 2, 00-193 Warsaw, Poland).',
        },
        {
          title: '16. Account deletion',
          body: '1. A User may delete their Account in the App: Profile → Account → Delete account, after confirming the username and re-authenticating. For an Account created with Sign in with Apple, the Controller also revokes the App\'s access to the User\'s Apple ID.\n2. Deleting the Account deletes the Account, profile, relationships, Messages, NiXes, voice recordings, avatar and data exports. Files shared with other Users are deleted from the server within minutes. Only evidence secured in connection with reports (until the end of the period in section 14(d)) and report resolutions and moderation decisions without a link to the deleted Account are retained.\n3. Signing out or deleting the App from a device does not delete the Account. A User who has lost access to the App may request deletion at nix@shipapp.pl from the email address associated with the Account.',
        },
        {
          title: '17. Automated decision-making',
          body: 'The Controller does not take decisions concerning Users based solely on automated processing, including profiling, that produce legal effects or similarly significantly affect them within the meaning of Art. 22 GDPR. The automated content checks described in section 7 concern only the delivery of a specific item of content; restriction or suspension of an Account follows a decision of the moderation team.',
        },
        {
          title: '18. Minors',
          body: 'The service is intended for persons aged 16 and over. The date of birth is checked only on the device and is not stored; the Controller keeps only the confirmation of being aged 16 or over. If the Controller learns that a person under 16 is using the service, it deletes their Account.',
        },
        {
          title: '19. Changes to this Policy',
          body: 'The Controller may amend this Policy, in particular following changes in the law or in the service. Users are informed in the App of material changes before they take effect. The current version of the Policy is available in the App and on the Website.',
        },
      ],
    },
    terms: {
      version: '2026-10-12',
      effectiveDate: '12 October 2026',
      sections: [
        { title: 'Provider', body: 'NiX is a ShipApp brand, provided by MT Hub Damian Motyliński, ul. ks. Józefa Poniatowskiego 27a lok. 2, 76-200 Słupsk, Poland, tax ID 8393229228. Contact: nix@shipapp.pl.' },
        { title: 'Service', body: 'NiX enables accepted friends to exchange ephemeral text, voice, photo, and video messages. Use requires a compatible device, Internet access and an account.' },
        { title: 'Account', body: 'You must be 16 or older, confirm that threshold, provide accurate registration data, and keep your account secure. Email and Apple accounts can be separate. A username cannot be changed once set.' },
        { title: 'Your content', body: 'You retain rights in your content and grant only the non-exclusive, royalty-free technical permission necessary to host, process and deliver it to the selected recipient.' },
        { title: 'Prohibited use', body: 'Do not send content you lack rights to use, unlawful content, or content that violates privacy, personality, copyright or safety. Harassment, impersonation, bypassing safeguards and disrupting the service are prohibited. We have zero tolerance for objectionable content and abusive users: we remove such content and may permanently ban the account.' },
        { title: 'Safety and moderation', body: 'Before delivery we automatically screen text, photos, and video (sampled frames for video) with Microsoft Azure AI Content Safety to block prohibited content. The working copy used for screening is deleted after the decision. A recipient can report a message and block its sender. We may warn, suspend, or ban an account for safety, the rights of others, or legal compliance. Appeal at nix@shipapp.pl.' },
        { title: 'Availability', body: 'The service is provided as is and can be temporarily unavailable because of maintenance, updates or events outside our control. We do not guarantee that messages remain available after their ephemeral lifecycle.' },
        { title: 'Complaints and termination', body: 'Send complaints with a description of the issue to nix@shipapp.pl. You may end the agreement by deleting the account in the app; deletion is irreversible.' },
        { title: 'Changes and law', body: 'We announce material changes before they take effect. Polish law applies without limiting mandatory consumer protections.' },
      ],
    },
  },
};
