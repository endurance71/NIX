# Friend Invite Test Plan (iOS)

## Manual testy end-to-end

1. Użytkownik A otwiera `Mój QR` i generuje kod.
2. Użytkownik B otwiera `Skanuj QR` i skanuje kod A.
3. Oczekiwany wynik: status `request_sent` albo `accepted_reverse_request`, a relacja pojawia się w profilu.

4. Użyć kodu po wygaśnięciu (ponad 5 minut).
5. Oczekiwany wynik: komunikat `invalid_or_expired`.

6. Użyć tego samego kodu drugi raz.
7. Oczekiwany wynik: komunikat `invalid_or_expired` (single-use).

8. Spróbować zrealizować własne zaproszenie.
9. Oczekiwany wynik: komunikat `own_invite`.

## SQL smoke tests (Supabase SQL Editor)

```sql
-- 1) Tworzenie tokenu
select * from public.create_friend_invite('qr');

-- 2) Redeem tokenu (podmień na token z kroku 1)
select * from public.redeem_friend_invite('PUT_TOKEN_HERE');

-- 3) Ponowne użycie (powinno zwrócić błąd / invalid_or_expired po stronie app)
select * from public.redeem_friend_invite('PUT_TOKEN_HERE');
```

