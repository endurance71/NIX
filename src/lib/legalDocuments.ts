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
          title: 'Prywatność w skrócie',
          body: 'NiX powstał po to, żeby bliskie rozmowy zostawały między wami. Oto, na co możesz liczyć:\n• Piszesz tylko z osobami, które przyjmiesz do znajomych.\n• Wiadomości znikają po 24 godzinach, a zdjęcia i filmy z NiX-ów — wkrótce po obejrzeniu. Zostaje tylko to, co sami zapiszecie.\n• Nie pokazujemy reklam, nie śledzimy Cię i nie sprzedajemy Twoich danych.\n• Wspomnienia są zaszyfrowane na Twoim iPhonie — nigdy na naszych serwerach.\n• Zanim coś trafi do odbiorcy, przechodzi automatyczną kontrolę bezpieczeństwa.\n• Kopię danych pobierzesz, a konto usuniesz w aplikacji — w każdej chwili.\nPoniżej wszystko szczegółowo, prostym językiem i bez drobnego druku.',
        },
        {
          title: 'Kto dba o Twoje dane',
          body: 'NiX jest marką ShipApp. Administratorem Twoich danych osobowych jest MT Hub Damian Motyliński, ul. ks. Józefa Poniatowskiego 27a lok. 2, 76-200 Słupsk, NIP 8393229228. W każdej sprawie dotyczącej prywatności napisz na nix@shipapp.pl — odpowiadamy osobiście.',
        },
        {
          title: 'Jakie dane zbieramy',
          body: 'Tylko te, bez których NiX nie zadziała:\n• Konto: e-mail i dane logowania (hasło w postaci zabezpieczonej albo identyfikator Apple przy logowaniu przez Apple), identyfikator konta, potwierdzenie ukończenia 16 lat i akceptacja dokumentów.\n• Profil i znajomi: nazwa użytkownika, nazwa wyświetlana, opis, awatar, ustawienie konta prywatnego, lista znajomych, zaproszenia i blokady.\n• Wiadomości: teksty, głosówki, zdjęcia i filmy (NiX-y) wraz z reakcjami, odpowiedziami, przekazaniami, zapisaniem, czasem wyświetlania, statusem „Doręczono” i „Otwarto” oraz poprzednimi wersjami edytowanych wiadomości.\n• Aktywność w rozmowach: dzienne liczniki wymian (serie i najlepsi znajomi), przypięte i wyciszone rozmowy oraz próby zrzutu ekranu NiX-a.\n• Bezpieczeństwo: zgłoszenia, zabezpieczone dowody i decyzje moderacji.\n• Urządzenie: token powiadomień, nazwa i model urządzenia, wersja iOS i aplikacji, język oraz czas ostatniej aktywności (ekran „Urządzenia”).\nNie zbieramy Twojej lokalizacji, kontaktów z książki adresowej ani identyfikatora reklamowego.',
        },
        {
          title: 'Po co ich używamy',
          body: 'Żeby prowadzić Twoje konto, łączyć Cię ze znajomymi i doręczać wiadomości — to wykonanie umowy (art. 6 ust. 1 lit. b RODO). Żeby chronić Ciebie i innych przed nadużyciami, rozpatrywać zgłoszenia i bronić się przed roszczeniami — to nasz uzasadniony interes (art. 6 ust. 1 lit. f RODO). Gdy wymaga tego prawo, na przykład na żądanie uprawnionych organów — obowiązek prawny (art. 6 ust. 1 lit. c RODO).',
        },
        {
          title: 'Twoje wiadomości i ich czas życia',
          body: '• Teksty i głosówki znikają same 24 godziny po wysłaniu.\n• Każde z was może zapisać wiadomość w rozmowie. Zapisana zostaje, dopóki któreś z was jej nie odpisze (wtedy znika po 24 godzinach) albo nie usuniecie rozmowy.\n• Zdjęcie lub film z NiX-a usuwamy z serwera około 10 minut po pierwszym obejrzeniu — to czas na ponowne odtworzenie. Nieobejrzany NiX czeka na odbiorcę. W rozmowie zostaje informacja o NiX-ie, a przy filmie mała miniatura podglądu, dopóki nie usuniecie rozmowy.\n• Wiadomość edytujesz przez 15 minut (do 5 razy) i cofniesz przez 5 minut od wysłania. Poprzednie wersje edytowanej wiadomości przechowujemy razem z nią tylko na wypadek zgłoszenia — nikt nie widzi ich w aplikacji.\n• Przekazanie tworzy nową wiadomość do wybranego znajomego, z własnym czasem znikania.\n• Usunięcie rozmowy kasuje wiadomości i NiX-y po obu stronach. Po zablokowaniu wiadomości są ukryte; całkiem usuniesz je, usuwając rozmowę.',
        },
        {
          title: 'Zrzuty ekranu i zapisywanie',
          body: 'Zrzuty ekranu i nagrywanie Twoich NiX-ów są domyślnie zablokowane, a gdy ktoś spróbuje, dostaniesz powiadomienie. Wybranym znajomym możesz pozwolić na zapis — wtedy odbiorca może zachować Twój NiX w Zdjęciach na swoim urządzeniu, już poza kontrolą NiX-a. Ochrona dotyczy NiX-ów, nie czatu ani głosówek, a żadna blokada nie wyklucza np. sfotografowania ekranu innym urządzeniem.',
        },
        {
          title: 'Kontrola bezpieczeństwa i moderacja',
          body: 'Zanim wiadomość trafi do odbiorcy, tekst, zdjęcia i wybrane klatki filmów sprawdza automatycznie Microsoft Azure AI Content Safety (centrum danych w Szwecji) oraz nasz filtr niedozwolonych słów. Szukamy wyłącznie treści niedozwolonych — nienawiści, przemocy, samookaleczeń i treści seksualnych. Treść odrzucona nie jest doręczana, a roboczą kopię do kontroli usuwamy po decyzji, najpóźniej po 24 godzinach. Głosówki i dźwięk filmów nie są analizowane automatycznie.\nKażdą wiadomość, NiX-a i profil możesz zgłosić. Zgłoszenie zabezpiecza dowód — kopię zdjęcia, filmu, nagrania albo treści wiadomości z jej poprzednimi wersjami — na 30 dni. Zespół moderacji może usunąć treść i ograniczyć konto. Zgłoszenia dotyczące bezpieczeństwa dzieci rozpatrujemy w pierwszej kolejności i przekazujemy właściwym organom, gdy wymaga tego prawo.',
        },
        {
          title: 'Konto prywatne i znajomi',
          body: 'Znajomych dodajesz przez dokładną nazwę użytkownika, kod QR (ważny 5 minut) albo zaproszenie. Konta prywatnego nie da się znaleźć po nazwie ani zaprosić bezpośrednio — tylko kodem lub zaproszeniem od jego właściciela. Nie przesyłamy Twojej książki adresowej i nie podpowiadamy obcych osób.',
        },
        {
          title: 'Powiadomienia',
          body: 'Powiadomienia są opcjonalne — wyłączysz je w Profilu albo w ustawieniach iOS. Zawierają nazwę i awatar nadawcy oraz rodzaj zdarzenia, nigdy treść wiadomości, zdjęcie ani film. Żeby wyglądały jak wiadomość od znajomego, iOS może zapamiętać na urządzeniu nazwę i awatar nadawcy (np. dla sugestii Siri i trybów skupienia). Powiadomienie o próbie zrzutu ekranu Twojego NiX-a wysyłamy także wtedy, gdy powiadomienia o wiadomościach wyłączysz w Profilu.',
        },
        {
          title: 'Aparat, mikrofon i zdjęcia',
          body: 'Z aparatu, mikrofonu i biblioteki zdjęć korzystamy dopiero po Twojej zgodzie w iOS — do zdjęć, filmów i głosówek, skanowania kodów QR, wyboru awatara i zapisu w Zdjęciach. Zgodę cofniesz w ustawieniach iOS; wtedy dana funkcja nie będzie dostępna.',
        },
        {
          title: 'Co zostaje tylko na Twoim iPhonie',
          body: '• Wspomnienia — wysłane przez Ciebie NiX-y, jeśli włączysz ich zapisywanie — szyfrujemy (AES-256) kluczem zapisanym w pęku kluczy tego iPhone\'a. Nie trafiają na nasze serwery ani do eksportu danych. Kopia zapasowa iCloud zawiera tylko zaszyfrowane pliki, których nie da się otworzyć na innym urządzeniu. Limit to 500 MB; po jego przekroczeniu najstarsze usuwamy automatycznie.\n• Odebrane zdjęcia czekające na otwarcie trzymamy chwilę w zaszyfrowanej pamięci podręcznej.\n• Widżet i Live Activity pokazują tylko liczbę nowych NiX-ów i postęp wysyłania — bez nazw i treści.\n• Zdjęcia z aparatu na ekranie blokady i pliki udostępnione z innych aplikacji zostają na urządzeniu, dopóki ich nie wyślesz.\nWylogowanie usuwa z urządzenia Wspomnienia i ich klucz, pamięć podręczną oraz kolejkę wysyłania.',
        },
        {
          title: 'Komu powierzamy dane',
          body: 'Tylko zaufanym dostawcom, bez których NiX nie działa, i tylko w niezbędnym zakresie:\n• Supabase — konta, baza danych, pliki i funkcje serwerowe (Irlandia, UE).\n• Microsoft Azure AI Content Safety — kontrola bezpieczeństwa (Szwecja, UE).\n• OVHcloud — serwer przygotowujący filmy do kontroli (Francja, UE).\n• Expo i Apple — dostarczanie powiadomień i aktualizacji aplikacji, logowanie przez Apple i App Store.\nNie sprzedajemy danych i nie udostępniamy ich reklamodawcom. Analityka produktu i raportowanie błędów (Sentry) są w aplikacji wyłączone.',
        },
        {
          title: 'Przekazywanie poza Europę',
          body: 'Twoje dane przechowujemy w Unii Europejskiej. Expo i Apple mogą przetwarzać dane potrzebne do powiadomień i logowania także w USA — wyłącznie na podstawie decyzji o odpowiednim stopniu ochrony (EU–US Data Privacy Framework) albo standardowych klauzul umownych, zgodnie z rozdziałem V RODO.',
        },
        {
          title: 'Jak długo przechowujemy dane',
          body: '• Konto, profil, znajomi, blokady, potwierdzenie wieku, akceptacja dokumentów, urządzenia, przypięte i wyciszone rozmowy oraz liczniki serii — do usunięcia konta.\n• Wiadomości i NiX-y — jak opisaliśmy w sekcji o czasie życia wiadomości.\n• Robocze kopie do kontroli bezpieczeństwa — do decyzji, najpóźniej 24 godziny.\n• Dowody ze zgłoszeń — 30 dni; rozstrzygnięte zgłoszenia — 365 dni; decyzje wobec kont (ostrzeżenia, blokady) — tak długo, jak są potrzebne do ochrony społeczności.\n• Historia wysyłki powiadomień — 30 dni. Token powiadomień wyłączamy po wylogowaniu, a usuwamy razem z kontem.\n• Archiwum eksportu danych — 24 godziny od przygotowania.\n• Metadane techniczne wysyłki multimediów i kontroli bezpieczeństwa — do usunięcia konta.',
        },
        {
          title: 'Twoje prawa',
          body: 'Masz prawo do dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, przenoszenia i sprzeciwu — gdy przysługują. Kopię swoich danych pobierzesz w aplikacji: Profil → Prywatność i bezpieczeństwo → Eksport danych (archiwum ZIP, gotowe w kilka minut). Pozostałe wnioski wyślij na nix@shipapp.pl. Możesz też złożyć skargę do Prezesa Urzędu Ochrony Danych Osobowych.',
        },
        {
          title: 'Usunięcie konta',
          body: 'Konto usuniesz w aplikacji: Profil → Konto → Usuń konto, po potwierdzeniu nazwy użytkownika i ponownym zalogowaniu. Przy logowaniu przez Apple odbieramy też NiX-owi dostęp do Twojego Apple ID. Usuwamy konto, profil, znajomych, wiadomości, NiX-y, głosówki, awatar i eksporty; pliki współdzielone z innymi znikają z serwera w ciągu kilku minut. Zostają tylko dowody ze zgłoszeń (do 30 dni) i rozstrzygnięcia bez powiązania z Twoim kontem. Wylogowanie ani usunięcie aplikacji nie usuwa konta. Nie masz dostępu do aplikacji? Napisz na nix@shipapp.pl z adresu przypisanego do konta.',
        },
        {
          title: 'Dzieci i zmiany polityki',
          body: 'NiX jest dla osób od 16 lat. Datę urodzenia sprawdzamy tylko na urządzeniu i jej nie zapisujemy — przechowujemy wyłącznie potwierdzenie 16+. Nie używamy analityki ani śledzenia; jeśli to się zmieni, najpierw zapytamy Cię o zgodę. O istotnych zmianach tej polityki poinformujemy w aplikacji, zanim wejdą w życie.',
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
          title: 'Privacy at a glance',
          body: 'NiX was built so that close conversations stay between you. Here is what you can count on:\n• You only talk to people you accept as friends.\n• Messages disappear after 24 hours, and NiX photos and videos soon after they are viewed. Only what you choose to save stays.\n• No ads, no tracking, and we never sell your data.\n• Memories are encrypted on your iPhone — never on our servers.\n• Before anything reaches the recipient, it goes through an automatic safety check.\n• Download a copy of your data or delete your account in the app, any time.\nBelow are the details, in plain language and without fine print.',
        },
        {
          title: 'Who looks after your data',
          body: 'NiX is a ShipApp brand. The controller of your personal data is MT Hub Damian Motyliński, ul. ks. Józefa Poniatowskiego 27a lok. 2, 76-200 Słupsk, Poland, tax ID (NIP) 8393229228. For anything about your privacy, email nix@shipapp.pl — a real person will answer.',
        },
        {
          title: 'What we collect',
          body: 'Only what NiX needs to work:\n• Account: email and sign-in data (a protected password, or your Apple identifier with Sign in with Apple), account ID, confirmation that you are 16 or older, and acceptance of these documents.\n• Profile and friends: username, display name, bio, avatar, private-account setting, friend list, invites and blocks.\n• Messages: texts, voice messages, photos and videos (NiXes), with reactions, replies, forwards, saves, view time, “Delivered” and “Opened” status, and earlier versions of edited messages.\n• Conversation activity: daily exchange counts (streaks and best friends), pinned and muted conversations, and attempts to screenshot a NiX.\n• Safety: reports, secured evidence and moderation decisions.\n• Device: notification token, device name and model, iOS and app version, language, and last activity (the Devices screen).\nWe do not collect your location, your address book or an advertising identifier.',
        },
        {
          title: 'Why we use it',
          body: 'To run your account, connect you with friends and deliver messages — performance of our contract (Art. 6(1)(b) GDPR). To protect you and others from abuse, handle reports and defend legal claims — our legitimate interest (Art. 6(1)(f) GDPR). Where the law requires it, for example at the request of competent authorities — a legal obligation (Art. 6(1)(c) GDPR).',
        },
        {
          title: 'Your messages and how long they live',
          body: '• Texts and voice messages disappear on their own 24 hours after sending.\n• Either of you can save a message in the conversation. A saved message stays until one of you unsaves it (it then disappears after 24 hours) or you delete the conversation.\n• A NiX photo or video is deleted from our servers about 10 minutes after it is first viewed — the replay window. An unopened NiX waits for its recipient. The conversation keeps a note of the NiX, and for a video a small preview thumbnail, until you delete the conversation.\n• You can edit a message for 15 minutes (up to 5 times) and undo sending for 5 minutes. Earlier versions of an edited message are kept with it only in case it is reported — no one can see them in the app.\n• Forwarding creates a new message to the friend you pick, with its own disappearing timer.\n• Deleting a conversation removes its messages and NiXes for both of you. After a block, messages are hidden; delete the conversation to remove them completely.',
        },
        {
          title: 'Screenshots and saving',
          body: 'Screenshots and screen recordings of your NiXes are blocked by default, and if someone tries, you get notified. You can allow chosen friends to save — they can then keep your NiX in Photos on their device, outside NiX\'s control. This protection covers NiXes, not chat or voice messages, and no block can stop someone photographing a screen with another device.',
        },
        {
          title: 'Safety checks and moderation',
          body: 'Before a message reaches the recipient, its text, photos and selected video frames are checked automatically by Microsoft Azure AI Content Safety (data centre in Sweden) and our own blocked-words filter. We look only for prohibited content — hate, violence, self-harm and sexual content. Rejected content is never delivered, and the working copy used for the check is deleted after the decision, at the latest after 24 hours. Voice messages and video sound are not analysed automatically.\nYou can report any message, NiX or profile. A report secures evidence — a copy of the photo, video, recording or message text with its earlier versions — for 30 days. Our moderation team can remove content and restrict accounts. Child-safety reports are handled first and passed to the competent authorities where the law requires.',
        },
        {
          title: 'Private accounts and friends',
          body: 'You add friends by exact username, a QR code (valid for 5 minutes) or an invite. A private account cannot be found by username or invited directly — only with a code or invite from its owner. We never upload your address book or suggest strangers.',
        },
        {
          title: 'Notifications',
          body: 'Notifications are optional — turn them off in Profile or in iOS Settings. They show the sender\'s name and avatar and the kind of event, never the message text, photo or video. To show them as messages from a friend, iOS may remember the sender\'s name and avatar on your device (for example for Siri suggestions and Focus). A notification about an attempt to screenshot your NiX is sent even if you turn off message notifications in Profile.',
        },
        {
          title: 'Camera, microphone and photos',
          body: 'We use the camera, microphone and photo library only after you allow it in iOS — for photos, videos and voice messages, scanning QR codes, choosing an avatar and saving to Photos. You can withdraw access in iOS Settings; the related feature then stops working.',
        },
        {
          title: 'What stays only on your iPhone',
          body: '• Memories — NiXes you sent, if you turn saving on — are encrypted (AES-256) with a key kept in this iPhone\'s Keychain. They never reach our servers or your data export. An iCloud backup holds only encrypted files that cannot be opened on another device. The limit is 500 MB; above it the oldest are removed automatically.\n• Received photos waiting to be opened are kept briefly in an encrypted cache.\n• The widget and Live Activity show only the number of new NiXes and upload progress — no names or content.\n• Lock Screen camera shots and files shared from other apps stay on the device until you send them.\nSigning out removes Memories and their key, the cache and the send queue from the device.',
        },
        {
          title: 'Who we share data with',
          body: 'Only trusted providers NiX cannot work without, and only as much as needed:\n• Supabase — accounts, database, files and server functions (Ireland, EU).\n• Microsoft Azure AI Content Safety — safety checks (Sweden, EU).\n• OVHcloud — a server that prepares videos for checking (France, EU).\n• Expo and Apple — delivering notifications and app updates, Sign in with Apple and the App Store.\nWe do not sell data or share it with advertisers. Product analytics and crash reporting (Sentry) are turned off in the app.',
        },
        {
          title: 'Transfers outside Europe',
          body: 'Your data is stored in the European Union. Expo and Apple may also process the data needed for notifications and sign-in in the USA — only on the basis of an adequacy decision (EU–US Data Privacy Framework) or standard contractual clauses, under Chapter V GDPR.',
        },
        {
          title: 'How long we keep data',
          body: '• Account, profile, friends, blocks, age confirmation, document acceptance, devices, pinned and muted conversations and streak counts — until you delete your account.\n• Messages and NiXes — as described in the section on how long messages live.\n• Working copies for safety checks — until the decision, at most 24 hours.\n• Report evidence — 30 days; resolved reports — 365 days; decisions on accounts (warnings, suspensions) — as long as needed to protect the community.\n• Notification delivery history — 30 days. Your notification token is disabled when you sign out and deleted with your account.\n• Data export archives — 24 hours after they are ready.\n• Technical metadata about media uploads and safety checks — until you delete your account.',
        },
        {
          title: 'Your rights',
          body: 'You have the right to access, rectify, erase, restrict, port and object to the processing of your data, where these apply. Download a copy of your data yourself: Profile → Privacy & security → Data export (a ZIP archive, ready in minutes). Send any other request to nix@shipapp.pl. You can also lodge a complaint with the Polish data protection authority (Prezes UODO).',
        },
        {
          title: 'Deleting your account',
          body: 'Delete your account in the app: Profile → Account → Delete account, after confirming your username and signing in again. If you use Sign in with Apple, we also revoke NiX\'s access to your Apple ID. We delete your account, profile, friends, messages, NiXes, voice messages, avatar and exports; files shared with others disappear from our servers within minutes. Only report evidence (up to 30 days) and decisions without a link to your account remain. Signing out or deleting the app does not delete your account. Can\'t access the app? Email nix@shipapp.pl from the address on your account.',
        },
        {
          title: 'Children and changes to this policy',
          body: 'NiX is for people aged 16 and over. We check your date of birth only on your device and never store it — we keep only the 16+ confirmation. We use no analytics or tracking; if that ever changes, we will ask for your consent first. We will tell you in the app about important changes to this policy before they take effect.',
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
