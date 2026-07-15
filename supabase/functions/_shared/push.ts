export const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_PUSH_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

export type PushEventType = 'new_nix' | 'friend_request' | 'friend_accepted';

export type PushJob = {
  id: string;
  event_type: PushEventType;
  recipient_id: string;
  actor_id: string;
  entity_id: string;
  attempts: number;
  created_at: string;
};

export type PushDevice = {
  id: string;
  expo_push_token: string;
  locale: 'pl' | 'en';
};

export function pushCopy(type: PushEventType, username: string, locale: 'pl' | 'en') {
  const actor = `@${username.replace(/^@/, '')}`;
  if (locale === 'pl') {
    if (type === 'new_nix') return { title: 'NiX', body: `${actor} wysyła Ci nowy NiX` };
    if (type === 'friend_request') return { title: 'Nowe zaproszenie', body: `${actor} chce dodać Cię do znajomych` };
    return { title: 'Nowa znajomość', body: `Ty i ${actor} jesteście teraz znajomymi` };
  }
  if (type === 'new_nix') return { title: 'NiX', body: `${actor} sent you a new NiX` };
  if (type === 'friend_request') return { title: 'New friend request', body: `${actor} wants to add you as a friend` };
  return { title: 'New friend', body: `You and ${actor} are now friends` };
}

export function retryAt(attempts: number) {
  const delayMinutes = Math.min(60, 2 ** Math.max(0, attempts - 1));
  return new Date(Date.now() + delayMinutes * 60_000).toISOString();
}

export function expoHeaders(accessToken: string) {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}
