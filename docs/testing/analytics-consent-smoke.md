# Smoke: analytics consent refuse / revoke

Offline unit: `src/services/productAnalyticsService.test.ts`.

Client contract: `recordProductEvent` checks feature flag **and** local consent
preference before any `record_product_analytics_event` RPC — no network write
attempt when consent is missing or revoked.

Manual (when analytics flag temporarily on for QA only):

1. Onboarding: leave analytics off → complete → no analytics RPC.
2. Profile → Privacy & security → disable analytics → confirm switch off; further
   `recordProductEvent` calls return false without RPC.
3. Public candidate defaults: `EXPO_PUBLIC_PRODUCT_ANALYTICS_ENABLED=false` and
   `EXPO_PUBLIC_SENTRY_ENABLED=false` in `eas.json` production + `.env.production`.
