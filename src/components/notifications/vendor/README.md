Animation geometry and capsule timeline adapted from https://github.com/rit3zh/expo-dynamic-notifications
Commit: 5de059a5cbefbe28c14efbe785166665a7c70bc5

The MIT license is preserved in LICENSE. Only geometry/math and motion constants are vendored; NiX owns
the presentation, themes, queue, lifecycle, gestures and accessibility.

timeline.ts preserves the upstream spring settings, phase delays and content scale.
The NiX hook adds readiness, Reduce Motion, presentation timing and generation guards.

Since 2026-10-10 (NOTIF-4) the upstream sequence is used only for rare `prominent` notifications;
the default NiX card enters in 300 ms and exits in 220 ms (CARD_* constants in timeline.ts), and
NotificationGoo (Skia) is loaded lazily on the first prominent card (PERF-4).
