import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

export const SUPPORTED_LOCALES = ['pl', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

function resolveInitialLocale(): SupportedLocale {
  const preferred = getLocales()[0]?.languageCode?.toLowerCase();
  if (preferred === 'pl') return 'pl';
  return 'en';
}

const resources = {
  pl: {
    translation: {
      common: {
        loading: 'Ładowanie…',
        unknownUser: 'nieznanego użytkownika',
        unknown: 'Nieznany',
      },
      root: {
        bootstrapTooLong: 'Uruchamianie trwa zbyt długo. Możesz przejść do logowania.',
        goToLogin: 'Przejdź do logowania',
        qrMyCode: 'Mój kod QR',
        qrScan: 'Skanuj QR',
        invite: 'Zaproszenie',
      },
      tabs: {
        camera: 'Kamera',
        inbox: 'Skrzynka',
        profile: 'Profil',
      },
      auth: {
        registerTitle: 'Rejestracja',
        checkEmailTitle: 'Sprawdź email',
        forgotPasswordTitle: 'Reset hasła',
        resetPasswordTitle: 'Nowe hasło',
        onboardingTitle: 'Profil',
        tagline: 'Ultraprywatne wiadomości wizualne',
        loginTitle: 'Zaloguj się',
        loginLoading: 'Logowanie…',
        loginButton: 'Zaloguj',
        forgotPassword: 'Nie pamiętam hasła',
        noAccount: 'Nie masz konta? Zarejestruj się',
        emailRequired: 'Podaj adres e-mail.',
        passwordRequired: 'Podaj hasło.',
        invalidCredentials: 'Nieprawidłowy e-mail lub hasło.',
        emailNotConfirmed: 'Najpierw potwierdź e-mail. Sprawdź skrzynkę.',
        emailPlaceholder: 'twój@email.com',
        passwordPlaceholder: 'Wpisz hasło',
        registerHeader: 'Załóż konto',
        registerDescription: 'Utwórz konto e-mail + hasło, aby korzystać z NiX.',
        emailField: 'E-mail',
        passwordField: 'Hasło (min. 8 znaków)',
        confirmPasswordField: 'Powtórz hasło',
        registerLoading: 'Rejestracja…',
        registerButton: 'Zarejestruj',
        hasAccount: 'Masz konto? Zaloguj się',
        invalidEmail: 'Podaj poprawny adres e-mail.',
        passwordMin: 'Hasło musi mieć minimum 8 znaków.',
        passwordMismatch: 'Hasła nie są takie same.',
        accountExists: 'To konto już istnieje. Zaloguj się.',
      },
      inbox: {
        title: 'Skrzynka',
        openNixA11y: 'Otwórz nix od @{{username}}',
        sentToA11y: 'Wysłano do @{{username}}',
        newNix: 'Nowy NiX',
        opened: 'Otwarto',
        sent: 'Wysłane',
        deleteConversationSuccess: 'Usunięto rozmowę z @{{username}}.',
        deleteConversationFailure: 'Nie udało się usunąć rozmowy.',
        inviteAccepted: 'Zaproszenie zaakceptowane.',
        inviteRemoved: 'Zaproszenie usunięte.',
        inviteAcceptFailure: 'Nie udało się zaakceptować zaproszenia.',
        inviteRemoveFailure: 'Nie udało się usunąć zaproszenia.',
        invitesSection: 'Zaproszenia ({{count}})',
        messagesSection: 'Wiadomości ({{count}})',
        noMessages: 'Brak wiadomości.',
        accept: 'Przyjmij',
        remove: 'Usuń',
      },
      profile: {
        title: 'Profil',
        myQrCode: 'Mój kod QR',
        addFriend: 'Dodaj znajomego',
        scanQr: 'Skanuj QR',
        sendInvite: 'Wyślij zaproszenie',
        sendInviteLoading: 'Wysyłanie...',
        incomingInvites: 'Zaproszenia ({{count}})',
        outgoingInvites: 'Wysłane zaproszenia ({{count}})',
        friends: 'Znajomi ({{count}})',
        account: 'Konto',
        changePassword: 'Zmień hasło',
        signOut: 'Wyloguj',
      },
      notify: {
        refreshFailedTitle: 'Odświeżenie nie powiodło się.',
        refreshFailedBody: 'Spróbuj ponownie.',
      },
      domainErrors: {
        UNAUTHORIZED: 'Brak autoryzacji.',
        INVALID_RECEIVER: 'Nieprawidłowy odbiorca.',
        INVALID_INPUT: 'Nieprawidłowe dane wejściowe.',
        NOT_FRIEND: 'Ta operacja wymaga zaakceptowanej znajomości.',
        RATE_LIMITED: 'Limit operacji został przekroczony. Spróbuj ponownie za chwilę.',
        INVALID_MEDIA: 'Nieprawidłowe multimedia.',
        CLEANUP_FAILED: 'Nie udało się wyczyścić wiadomości.',
        CANCELLED: 'Operacja została anulowana.',
        UNKNOWN: 'Wystąpił nieoczekiwany błąd.',
      },
      sentStatus: {
        opened: 'Otwarto',
        cleaned: 'Usunięte',
        cleanupFailed: 'Błąd usuwania',
      },
    },
  },
  en: {
    translation: {
      common: {
        loading: 'Loading…',
        unknownUser: 'unknown user',
        unknown: 'Unknown',
      },
      root: {
        bootstrapTooLong: 'Startup is taking too long. You can go to login.',
        goToLogin: 'Go to login',
        qrMyCode: 'My QR code',
        qrScan: 'Scan QR',
        invite: 'Invite',
      },
      tabs: {
        camera: 'Camera',
        inbox: 'Inbox',
        profile: 'Profile',
      },
      auth: {
        registerTitle: 'Register',
        checkEmailTitle: 'Check email',
        forgotPasswordTitle: 'Reset password',
        resetPasswordTitle: 'New password',
        onboardingTitle: 'Profile',
        tagline: 'Ultra-private visual messages',
        loginTitle: 'Sign in',
        loginLoading: 'Signing in…',
        loginButton: 'Sign in',
        forgotPassword: 'Forgot password',
        noAccount: "Don't have an account? Register",
        emailRequired: 'Enter your email address.',
        passwordRequired: 'Enter your password.',
        invalidCredentials: 'Invalid email or password.',
        emailNotConfirmed: 'Confirm your email first. Check your inbox.',
        emailPlaceholder: 'you@email.com',
        passwordPlaceholder: 'Enter password',
        registerHeader: 'Create account',
        registerDescription: 'Create an email + password account to use NiX.',
        emailField: 'Email',
        passwordField: 'Password (min. 8 chars)',
        confirmPasswordField: 'Repeat password',
        registerLoading: 'Creating account…',
        registerButton: 'Register',
        hasAccount: 'Already have an account? Sign in',
        invalidEmail: 'Enter a valid email address.',
        passwordMin: 'Password must be at least 8 characters.',
        passwordMismatch: 'Passwords do not match.',
        accountExists: 'This account already exists. Sign in.',
      },
      inbox: {
        title: 'Inbox',
        openNixA11y: 'Open nix from @{{username}}',
        sentToA11y: 'Sent to @{{username}}',
        newNix: 'New NiX',
        opened: 'Opened',
        sent: 'Sent',
        deleteConversationSuccess: 'Deleted conversation with @{{username}}.',
        deleteConversationFailure: 'Failed to delete conversation.',
        inviteAccepted: 'Invite accepted.',
        inviteRemoved: 'Invite removed.',
        inviteAcceptFailure: 'Failed to accept invite.',
        inviteRemoveFailure: 'Failed to remove invite.',
        invitesSection: 'Invites ({{count}})',
        messagesSection: 'Messages ({{count}})',
        noMessages: 'No messages.',
        accept: 'Accept',
        remove: 'Remove',
      },
      profile: {
        title: 'Profile',
        myQrCode: 'My QR code',
        addFriend: 'Add friend',
        scanQr: 'Scan QR',
        sendInvite: 'Send invite',
        sendInviteLoading: 'Sending...',
        incomingInvites: 'Invites ({{count}})',
        outgoingInvites: 'Sent invites ({{count}})',
        friends: 'Friends ({{count}})',
        account: 'Account',
        changePassword: 'Change password',
        signOut: 'Sign out',
      },
      notify: {
        refreshFailedTitle: 'Refresh failed.',
        refreshFailedBody: 'Try again.',
      },
      domainErrors: {
        UNAUTHORIZED: 'Unauthorized.',
        INVALID_RECEIVER: 'Invalid receiver.',
        INVALID_INPUT: 'Invalid input.',
        NOT_FRIEND: 'This action requires an accepted friendship.',
        RATE_LIMITED: 'Rate limit exceeded. Try again in a moment.',
        INVALID_MEDIA: 'Invalid media.',
        CLEANUP_FAILED: 'Failed to clean up message.',
        CANCELLED: 'Operation was cancelled.',
        UNKNOWN: 'Unexpected error occurred.',
      },
      sentStatus: {
        opened: 'Opened',
        cleaned: 'Deleted',
        cleanupFailed: 'Delete failed',
      },
    },
  },
} as const;

const i18n = createInstance();

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    compatibilityJSON: 'v4',
    resources,
    lng: resolveInitialLocale(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
  });
}

export default i18n;

export function getCurrentLocale(): SupportedLocale {
  const current = i18n.language?.split('-')[0]?.toLowerCase();
  if (current === 'pl') return 'pl';
  return 'en';
}
