# Smoke: analytics consent refuse / revoke

Offline unit: `src/services/productAnalyticsService.test.ts`.

Manual (when analytics flag temporarily on for QA only):

1. Onboarding: leave analytics off → complete → no analytics events.
2. Profile → Privacy & security → disable analytics → confirm switch off; no further events.
3. Public candidate defaults: `EXPO_PUBLIC_PRODUCT_ANALYTICS_ENABLED=false` and
   `EXPO_PUBLIC_SENTRY_ENABLED=false` in `eas.json` production + `.env.production`.
