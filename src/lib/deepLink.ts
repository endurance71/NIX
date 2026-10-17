import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { supabase } from './supabase';
import { extractFriendInvitePayload } from './friendInvite';
import { isInboxDeepLink } from './deepLinkRoute';
import { savePendingFriendInviteToken } from './pendingFriendInvite';
import { recordProductEvent } from '../services/productAnalyticsService';
import { iosRoadmapFeatures } from '../config/iosRoadmapFeatures';
import { parseAuthConfirmLink } from './authDeepLink';
import { notifyError, notifyInfo } from './appNotify';
import i18n from './i18n';

async function handleAuthDeepLink(url: string, isCancelled: () => boolean) {
  const link = parseAuthConfirmLink(url);
  if (!link) return;

  // Never replace an existing session from a link: a crafted link could
  // otherwise sign the user into someone else's account.
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    notifyInfo(i18n.t('auth.linkIgnoredSignedIn'));
    return;
  }

  const { error } = await supabase.auth.verifyOtp({
    token_hash: link.tokenHash,
    type: link.type,
  });
  if (isCancelled()) return;
  if (error) {
    notifyError(i18n.t('auth.linkInvalid'));
    return;
  }

  if (link.type === 'recovery') {
    router.replace({ pathname: '/(auth)/reset-password', params: { source: 'deeplink' } });
  }
}

async function handleFriendInviteDeepLink(url: string) {
  const payload = extractFriendInvitePayload(url);
  if (!payload?.token && !payload?.profileId) return false;
  if (payload.token && !iosRoadmapFeatures.shareInvites) return false;
  if (payload.token) {
    void recordProductEvent('invite_opened', { channel: url.startsWith('https:') ? 'share' : 'deeplink' });
    // The root layout opens it from the saved token (see `pendingFriendInvite`).
    await savePendingFriendInviteToken(payload.token);
    return true;
  }

  // Legacy profile links carry no token to save; open them right away when signed in.
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    router.push({ pathname: '/friend-invite', params: { profileId: payload.profileId! } });
  }

  return true;
}

/**
 * Every link event counts: `useLinkingURL` keeps the last URL as state, so opening the same link
 * again (an invite tapped twice) changed nothing and was ignored.
 */
export function DeepLinkHandler() {
  useEffect(() => {
    let cancelled = false;
    const handle = (url: string) => {
      void (async () => {
        try {
          if (cancelled) return;
          if (isInboxDeepLink(url)) {
            router.replace('/(tabs)/inbox');
            return;
          }
          if (await handleFriendInviteDeepLink(url)) return;
          await handleAuthDeepLink(url, () => cancelled);
        } catch {
          // ignorujemy parsowanie / sesję przy niepoprawnym URL
        }
      })();
    };

    void Linking.getInitialURL().then((url) => {
      if (url) handle(url);
    });
    const subscription = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return null;
}
