export function formatShortTime(input: string | Date, locale: string): string {
  return new Date(input).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
}
