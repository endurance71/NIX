/**
 * Stub dla Vitest (środowisko node): niektóre moduły expo ciągną `react-native`,
 * którego wejście jest Flow — Rolldown nie parsuje Flow.
 */
export default {};
export const Platform = {
  OS: 'ios',
  select: <T>(opts: { ios?: T; android?: T; web?: T; default?: T }) => opts.ios ?? opts.default,
};
