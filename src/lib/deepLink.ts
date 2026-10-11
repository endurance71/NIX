import { useEffect } from 'react';
import { useLinkingURL } from 'expo-linking';
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
    await savePendingFriendInviteToken(payload.token);
    void recordProductEvent('invite_opened', { channel: url.startsWith('https:') ? 'share' : 'deeplink' });
  }

  const { data } = await supabase.auth.getSession();
  if (data.session) {
    router.push({
      pathname: '/friend-invite',
      params: {
        ...(payload.token ? { token: payload.token } : {}),
        ...(payload.profileId ? { profileId: payload.profileId } : {}),
      },
    });
  }

  return true;
}

export function DeepLinkHandler() {
  const linkingUrl = useLinkingURL();

  useEffect(() => {
    if (!linkingUrl) return;

    let cancelled = false;
    void (async () => {
      try {
        if (cancelled) return;
        if (isInboxDeepLink(linkingUrl)) {
          router.replace('/(tabs)/inbox');
          return;
        }
        if (await handleFriendInviteDeepLink(linkingUrl)) return;
        await handleAuthDeepLink(linkingUrl, () => cancelled);
      } catch {
        // ignorujemy parsowanie / sesję przy niepoprawnym URL
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [linkingUrl]);

  return null;
}
