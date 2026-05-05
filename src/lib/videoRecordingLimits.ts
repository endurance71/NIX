/** Maks. długość jednego pliku segmentu (sekundy). */
export const VIDEO_SEGMENT_MAX_DURATION_SEC = 30;

/** Maks. sumaryczny czas nagrania przy jednym przytrzymaniu (milisekundy). */
export const VIDEO_TOTAL_MAX_DURATION_MS = 180_000;

/** Próg long-press zanim uznamy nagranie wideo (krótszy kontakt = zdjęcie). */
export const VIDEO_HOLD_THRESHOLD_MS = 220;

/** Pauza między łańcuchowymi wywołaniami recordAsync (stabilność kamery). */
export const VIDEO_CHAIN_GAP_MS = 80;
