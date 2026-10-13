import { beforeEach, describe, expect, it } from 'vitest';
import {
  isSignedInThisRun,
  isWelcomePending,
  markWelcomeSeen,
  noteAuthState,
  resetWelcome,
  resetWelcomeRunForTests,
  shouldOpenWelcome,
} from './welcomePresentation';

describe('welcomePresentation', () => {
  beforeEach(() => resetWelcomeRunForTests());

  it('otwiera powitanie raz na zakładkach', () => {
    expect(shouldOpenWelcome('u1', '(tabs)')).toBe(true);
    expect(shouldOpenWelcome('u1', '(tabs)')).toBe(false);
    expect(shouldOpenWelcome('u1', 'welcome')).toBe(false);
  });

  it('ponawia, gdy przekierowanie na profil przerwało otwieranie (nowe konto)', () => {
    expect(shouldOpenWelcome('u1', '(tabs)')).toBe(true);
    expect(shouldOpenWelcome('u1', '(auth)')).toBe(false);
    expect(shouldOpenWelcome('u1', 'activation')).toBe(false);
    expect(shouldOpenWelcome('u1', '(tabs)')).toBe(true);
  });

  it('otwiera ponownie, gdy spóźnione przekierowanie podmieniło otwarte powitanie', () => {
    expect(shouldOpenWelcome('u1', '(tabs)')).toBe(true);
    expect(shouldOpenWelcome('u1', 'welcome')).toBe(false);
    // router.replace('/(tabs)') after the profile step lands on top of the tour.
    expect(shouldOpenWelcome('u1', '(tabs)')).toBe(true);
  });

  it('nie wraca po zamknięciu, nawet po wyjściu z zakładek', () => {
    expect(shouldOpenWelcome('u1', '(tabs)')).toBe(true);
    markWelcomeSeen('u1');
    expect(shouldOpenWelcome('u1', 'chat')).toBe(false);
    expect(shouldOpenWelcome('u1', '(tabs)')).toBe(false);
  });

  it('po wylogowaniu pokazuje się znowu', () => {
    markWelcomeSeen('u1');
    resetWelcome();
    expect(shouldOpenWelcome('u1', '(tabs)')).toBe(true);
  });

  it('trzyma prośbę o powiadomienia do zamknięcia powitania po świeżym logowaniu', () => {
    expect(isWelcomePending('u1', true)).toBe(true);
    expect(isWelcomePending('u1', false)).toBe(false);
    expect(isWelcomePending(null, true)).toBe(false);
    markWelcomeSeen('u1');
    expect(isWelcomePending('u1', true)).toBe(false);
  });

  it('pamięta świeże logowanie po ponownym zamontowaniu aplikacji (stan poza komponentem)', () => {
    expect(isSignedInThisRun('u1')).toBe(false); // sesja przywrócona przy starcie
    noteAuthState(true); // ekran logowania / rejestracji
    expect(isSignedInThisRun(null)).toBe(false);
    // Po kodzie z maila drzewo montuje się od nowa: nowe komponenty pytają moduł, nie swój stan.
    expect(isSignedInThisRun('u1')).toBe(true);
    noteAuthState(false); // chwilowo pusta sesja w trakcie montowania niczego nie kasuje
    expect(isSignedInThisRun('u1')).toBe(true);
  });
});
