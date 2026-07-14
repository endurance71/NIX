import { useEffect } from 'react';
import { useLinkingURL } from 'expo-linking';
import { router } from 'expo-router';
import { supabase } from './supabase';
import { extractFriendInvitePayload } from './friendInvite';

function parseAuthUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    const hash = parsedUrl.hash.startsWith('#') ? parsedUrl.hash.slice(1) : parsedUrl.hash;
    const hashParams = new URLSearchParams(hash);
    const queryParams = parsedUrl.searchParams;

    const accessToken = hashParams.get('access_token') ?? queryParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token') ?? queryParams.get('refresh_token');
    const type = hashParams.get('type') ?? queryParams.get('type');

    return { accessToken, refreshToken, type };
  } catch {
    return { accessToken: null, refreshToken: null, type: null };
  }
}

async function handleAuthDeepLink(url: string, isCancelled: () => boolean) {
  const { accessToken, refreshToken, type } = parseAuthUrl(url);
  if (!accessToken || !refreshToken) return;

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (isCancelled() || error) return;

  if (type === 'recovery') {
    router.replace({ pathname: '/(auth)/reset-password', params: { source: 'deeplink' } });
  }
}

function handleFriendInviteDeepLink(url: string) {
  const payload = extractFriendInvitePayload(url);
  if (!payload?.token && !payload?.profileId) return false;

  router.push({
    pathname: '/friend-invite',
    params: {
      ...(payload.token ? { token: payload.token } : {}),
      ...(payload.profileId ? { profileId: payload.profileId } : {}),
    },
  });

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
        if (handleFriendInviteDeepLink(linkingUrl)) return;
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
