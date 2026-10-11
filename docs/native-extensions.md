# Rozszerzenia natywne iOS

Rozszerzenia, których nie generuje żaden plugin Expo. Źródła są w `plugins/native-extensions/` (źródło prawdy). Plugin `plugins/withNativeExtensions.js` kopiuje je do `ios/` i dodaje targety Xcode z deterministycznymi identyfikatorami, więc jest idempotentny: można go uruchomić na istniejącym `ios/` i po `prebuild`. Każda zmiana tutaj jest natywna: wydanie przez Xcode Archive z nowym `runtimeVersion`, nigdy przez OTA.

| Target | Bundle ID | iOS | Co robi |
| --- | --- | --- | --- |
| `NixShareExtension` | `com.damianmotylinski.nixapp.ShareExtension` | 16.4 | „NiX” w arkuszu udostępniania (Zdjęcia i inne aplikacje). Kopiuje jedno zdjęcie lub wideo do kontenera App Group (`SharedIntake/<UUID>.<ext>`) i otwiera `nix://share-intake?file=…&kind=photo|video`. Ekran `src/app/share-intake.tsx` przenosi plik do cache i otwiera podgląd. |
| `NixNotificationService` | `com.damianmotylinski.nixapp.NotificationService` | 16.4 | Powiadomienia komunikacyjne: awatar i nazwa nadawcy (`INSendMessageIntent`), wątek per rozmowa. Wymaga `mutableContent`, `senderName` i `senderAvatarUrl` z `push-dispatch` oraz uprawnienia `com.apple.developer.usernotifications.communication` w aplikacji. Bez tych pól powiadomienie zostaje bez zmian. |
| `NixCaptureExtension` | `com.damianmotylinski.nixapp.CaptureExtension` | 18.0 | Aparat z ekranu blokady (LockedCameraCapture). Zdjęcia trafiają do katalogu sesji; po odblokowaniu `LockedCaptureIntake` (moduł `nix-camera-torch`, `consumeLockedCapturesAsync`) otwiera najnowsze w podglądzie. |

Wspólny `NiXShared/NixCaptureIntent.swift` (`CameraCaptureIntent`) jest kompilowany do aplikacji, rozszerzenia widżetów (przycisk „Zrób NiX” w Centrum sterowania i na ekranie blokady) i rozszerzenia aparatu.

## Manifesty prywatności

Każde rozszerzenie ma własny `PrivacyInfo.xcprivacy` w fazie Resources:
- rozszerzenia z tej listy mają go w swoim folderze w `plugins/native-extensions/`;
- widżet ma go w `plugins/widget-extras/` (dodaje go `withWidgetExtras.js`, bo `expo-widgets` go nie generuje).

Deklaruje on API „required reason” wywoływane przez ten target:
- Share: znaczniki czasu plików, C617.1;
- widżet: ten sam zestaw co aplikacja, bo linkuje React Native i `ExpoWidgets` (UserDefaults App Group, 1C8F.1);
- powiadomienia i aparat: pusty manifest.

Manifest aplikacji ma źródło prawdy w `app.json` → `ios.privacyManifests`. Nowe użycie takiego API w rozszerzeniu wymaga dopisania powodu, inaczej App Store Connect odrzuci build (ITMS-91053).

## Podpis i uprawnienia

Wszystkie targety używają automatycznego podpisu z zespołem aplikacji. Przy pierwszym buildzie `xcodebuild -allowProvisioningUpdates` rejestruje nowe Bundle ID i profile. Uprawnienie „Communication Notifications” musi być włączone dla App ID aplikacji (Xcode robi to przy automatycznym podpisie; w razie błędu włącz je ręcznie w portalu Apple Developer).

## Sprawdzanie

- Share: w Zdjęciach udostępnij zdjęcie i wideo do „NiX”; aplikacja ma otworzyć podgląd.
- Powiadomienia: wymagają wdrożonego `push-dispatch` z nowym payloadem; na starszym backendzie wyglądają jak dotąd.
- Aparat z blokady: dodaj przycisk „Zrób NiX” w Centrum sterowania lub na ekranie blokady, zablokuj telefon, zrób zdjęcie, stuknij „Wyślij w NiX”, odblokuj.
