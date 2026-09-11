# Polityka prywatności NiX — kanon po żywym enforcement 1.2

**Nie publikować** na `/privacy` ani w in-app `legalDocuments`, dopóki produkcja
ma `pre_delivery_moderation_enabled=true`, worker działa i contract RLS jest na
prod. Do tego czasu obowiązuje wersja `2026-08-01` w
[`privacy-policy.pl.md`](privacy-policy.pl.md) / [`privacy-policy.en.md`](privacy-policy.en.md).

Po włączeniu: wklej ten sam akapit do hosted `/privacy`, in-app i App Store
listing. Wersja i data muszą być identyczne.

## PL — zastąp sekcję „Bezpieczeństwo i moderacja”

Przed doręczeniem sprawdzamy tekst i zdjęcia automatycznym klasyfikatorem
bezpieczeństwa (Azure AI Content Safety, region UE). Dla wideo pobieramy próbki
klatek na osi czasu; to nie jest skan każdej klatki pliku. Odbiorca może zgłosić
konkretną wiadomość i zablokować nadawcę. Zgłoszenie jest oceniane przez
upoważnioną osobę; możemy ostrzec, czasowo zawiesić albo zablokować konto.
W sprawie wyniku lub odwołania napisz na kontakt@damianmotylinski.pl.

## EN — replace the “Safety and moderation” section

Before delivery we check text and photos with an automated safety classifier
(Azure AI Content Safety, EU region). For video we sample frames across the
timeline; this is not a frame-by-frame scan of the file. A recipient can report
a specific message and block its sender. An authorized person reviews reports
and may warn, suspend, or ban an account. Contact kontakt@damianmotylinski.pl
about a decision or appeal.

## App Privacy (ten sam kanon)

Pożywym C3 zadeklaruj przetwarzanie treści użytkownika przez klasyfikator
bezpieczeństwa (App Functionality). Nie oznaczaj diagnostyki Sentry, jeśli
binary ma runtime opt-in wyłączony.
