# Device smoke — kandydat App Review `1.0.11 (6+)`

Uruchom **po** C1–C7 i autoryzowanych deployach (granty, worker, flaga, contract,
`push-dispatch` v15). Build 5 nie jest kandydatem publicznym. Archive i Submit
**tylko po osobnej zgodzie**.

Dowody zapisuj w `~/.nix-ops/c8-device-YYYY-MM-DD.md` (PASS/FAIL, build number,
model). Bez PII, treści UGC i kont demo.

## Urządzenia

- [ ] iPhone (fizyczny), aktualne iOS wspierane przez binary
- [ ] iPad compatibility — Review: iPad Air 11" M3 (lub równoważny 11")
- [ ] IPv6 / NAT64 (np. sieć testowa Apple) oraz słaba sieć / airplane toggle

## Tożsamość

- [ ] Sign in with Apple (nowe konto)
- [ ] Logowanie e-mail
- [ ] Usunięcie konta Apple + revoke tokenu (P0-4)
- [ ] Clean install i upgrade z builda 5 → 6+

## Moderacja 1.2 (konto testowe, nie produkcyjni użytkownicy)

- [ ] Tekst dozwolony → `approved` → wiadomość i push dopiero po approved
- [ ] Tekst odrzucony → `CONTENT_NOT_ALLOWED`, brak INSERT, brak push
- [ ] Zdjęcie dozwolone / odrzucone analogicznie
- [ ] Wideo: worker używa próbek klatek (ffmpeg), nie miniatury; brak klatek → `error`, nie `approved`
- [ ] Provider down / 429 → `MODERATION_RETRYABLE`, brak fail-open INSERT
- [ ] Flaga off → nowe wysyłki zatrzymane albo wyłącznie `MODERATION_DISABLED` + legacy INSERT **tylko** gdy contract jeszcze nie zablokował INSERT

## Bezpieczeństwo i uprawnienia

- [ ] Report → remove/dismiss → appeal (liczby w `~/.nix-ops/`, nie Git)
- [ ] Block / unblock
- [ ] Odmowa push / kamery / mikrofonu / zdjęć — aplikacja nie crashuje
- [ ] Wklejenie obrazu w czacie
- [ ] Background upload, offline/retry

## Sieć i push

- [ ] Push dopiero po `approved` (brak powiadomienia dla pending/rejected/error)
- [ ] `push-dispatch` z `verify_jwt=true` odpowiada 200 dla crona z Vault JWT

## Werdykt

Jedno P0 FAIL = **NO-GO**. Wszystkie PASS + bramka CI z `ios-current.md` =
**READY FOR REVIEW**, potem Submit wyłącznie po zgodzie → **WAITING FOR REVIEW**.
