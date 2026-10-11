Animation geometry and capsule timeline adapted from https://github.com/rit3zh/expo-dynamic-notifications
Commit: 5de059a5cbefbe28c14efbe785166665a7c70bc5

The MIT license is preserved in LICENSE. Only geometry/math and motion constants are vendored; NiX owns
the presentation, themes, queue, lifecycle, gestures and accessibility.

timeline.ts preserves the upstream spring settings, phase delays and content scale.
The NiX hook adds readiness, Reduce Motion, presentation timing and generation guards.

Since 2026-10-11 every notification uses the upstream island sequence (owner decision), unless a
call passes `prominent: false`, Reduce Motion is on or the device has no Dynamic Island — those get
the fast NiX card (300 ms in, 220 ms out; CARD_* constants in timeline.ts). NotificationGoo (Skia)
stays out of app start (PERF-4) and is prefetched once the app is idle.
