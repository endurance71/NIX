import { supabase } from '../lib/supabase';
import { getCurrentUser } from './profileService';

export type FriendProfile = {
  id: string;
  username: string;
  avatar_storage_path?: string | null;
  avatar_emoji?: string | null;
};

export type IncomingFriendRequest = {
  id: string;
  requester: FriendProfile;
  created_at: string;
};

type FriendshipRow = {
  id: string;
  user_id: string;
  friend_id: string;
  status: 'pending' | 'accepted';
};

export type SendFriendRequestResult =
  | 'request_sent'
  | 'already_requested'
  | 'already_friends'
  | 'accepted_reverse_request';

export type InviteChannel = 'qr';

export type RedeemInviteResult = SendFriendRequestResult | 'invalid_or_expired' | 'own_invite';

export type FriendInviteTokenPayload = {
  token: string;
  expiresAt: string;
};

export type PreviewProfileQrResult = {
  status: 'ok' | 'invalid_profile' | 'own_profile';
  profile: FriendProfile | null;
};

type PublicProfileRpcRow = {
  id: string;
  username: string | null;
  avatar_storage_path?: string | null;
  avatar_emoji?: string | null;
};

function mapPublicProfileRow(row: PublicProfileRpcRow): FriendProfile | null {
  if (!row.username) return null;
  return {
    id: row.id,
    username: row.username,
    avatar_storage_path: row.avatar_storage_path ?? null,
    avatar_emoji: row.avatar_emoji ?? null,
  };
}

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '');
}

function mapFriendshipErrorMessage(error: unknown) {
  const rawMessage =
    typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
      ? error.message
      : null;

  if (!rawMessage) return 'Wystąpił błąd. Spróbuj ponownie.';
  if (rawMessage.includes('duplicate key value')) return 'Relacja znajomości już istnieje.';
  if (rawMessage.includes('row-level security')) return 'Brak uprawnień do wykonania tej operacji.';
  if (rawMessage.includes('Could not find the function public.create_friend_invite')) {
    return 'Brakuje migracji DB dla zaproszeń QR. Uruchom SQL z docs/supabase_setup.sql.';
  }
  if (rawMessage.includes('Could not find the function public.redeem_friend_invite')) {
    return 'Brakuje migracji DB dla realizacji zaproszeń. Uruchom SQL z docs/supabase_setup.sql.';
  }
  return rawMessage;
}

function toFriendlyError(error: unknown) {
  return new Error(mapFriendshipErrorMessage(error));
}

export function resolveFriendshipAction(
  currentUserId: string,
  friendId: string,
  existing: FriendshipRow[]
): SendFriendRequestResult {
  const accepted = existing.find((row) => row.status === 'accepted');
  if (accepted) return 'already_friends';

  const pendingOutgoing = existing.find(
    (row) => row.status === 'pending' && row.user_id === currentUserId && row.friend_id === friendId
  );
  if (pendingOutgoing) return 'already_requested';

  const pendingIncoming = existing.find(
    (row) => row.status === 'pending' && row.user_id === friendId && row.friend_id === currentUserId
  );
  if (pendingIncoming) return 'accepted_reverse_request';

  return 'request_sent';
}

export async function findProfileByUsername(username: string): Promise<FriendProfile | null> {
  const normalized = normalizeUsername(username);
  if (normalized.length < 3) {
    throw new Error('Nazwa użytkownika musi mieć co najmniej 3 znaki.');
  }

  const { data, error } = await supabase.rpc('get_public_profile_by_username', {
    search_username: normalized,
  });

  if (error) throw toFriendlyError(error);
  const profile = Array.isArray(data) ? data[0] : data;
  if (!profile?.username) return null;

  const mapped = mapPublicProfileRow(profile as PublicProfileRpcRow);
  return mapped ?? null;
}

async function listRelationsBetweenUsers(currentUserId: string, friendId: string) {
  const { data, error } = await supabase
    .from('friendships')
    .select('id, user_id, friend_id, status')
    .or(
      `and(user_id.eq.${currentUserId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${currentUserId})`
    );

  if (error) throw toFriendlyError(error);
  return (data ?? []) as FriendshipRow[];
}

/** Stan relacji z użytkownikiem w kontekście zaproszenia QR (przed wysłakiem). */
export type FriendInviteRelationStatus =
  | 'none'
  | 'already_friends'
  | 'outgoing_pending'
  | 'incoming_pending';

export async function getFriendInviteRelationStatus(otherUserId: string): Promise<FriendInviteRelationStatus> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Brak sesji. Zaloguj się ponownie.');

  const normalized = otherUserId.trim();
  if (!normalized || normalized === user.id) return 'none';

  const existing = await listRelationsBetweenUsers(user.id, normalized);
  const action = resolveFriendshipAction(user.id, normalized, existing);

  if (action === 'already_friends') return 'already_friends';
  if (action === 'already_requested') return 'outgoing_pending';
  if (action === 'accepted_reverse_request') return 'incoming_pending';
  return 'none';
}

export async function sendFriendRequest(friendId: string): Promise<SendFriendRequestResult> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Brak sesji. Zaloguj się ponownie.');
  if (user.id === friendId) throw new Error('Nie możesz dodać siebie do znajomych.');

  const existing = await listRelationsBetweenUsers(user.id, friendId);
  const action = resolveFriendshipAction(user.id, friendId, existing);

  if (action === 'already_friends' || action === 'already_requested') {
    return action;
  }

  if (action === 'accepted_reverse_request') {
    const pendingIncoming = existing.find(
      (row) => row.status === 'pending' && row.user_id === friendId && row.friend_id === user.id
    );

    if (!pendingIncoming) {
      throw new Error('Nie znaleziono zaproszenia do akceptacji.');
    }

    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', pendingIncoming.id)
      .eq('friend_id', user.id);

    if (error) throw toFriendlyError(error);
    return 'accepted_reverse_request';
  }

  const { error } = await supabase.from('friendships').insert({
    user_id: user.id,
    friend_id: friendId,
    status: 'pending',
  });

  if (error) throw toFriendlyError(error);
  return 'request_sent';
}

export async function listIncomingFriendRequests(): Promise<IncomingFriendRequest[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('friendships')
    .select('id, user_id, created_at')
    .eq('friend_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw toFriendlyError(error);

  const requesterIds = (data ?? []).map((row) => row.user_id as string);
  if (requesterIds.length === 0) return [];

  const { data: requesterProfiles, error: requesterProfilesError } = await supabase.rpc(
    'get_public_profiles_by_ids',
    {
      profile_ids: requesterIds,
    }
  );
  if (requesterProfilesError) throw toFriendlyError(requesterProfilesError);

  const requesterMap = new Map<string, FriendProfile>();
  for (const row of (requesterProfiles ?? []) as PublicProfileRpcRow[]) {
    const mapped = mapPublicProfileRow(row);
    if (mapped) requesterMap.set(mapped.id, mapped);
  }

  return (data ?? [])
    .map((row) => {
      const requester = requesterMap.get(row.user_id as string);
      if (!requester) return null;
      return {
        id: row.id as string,
        created_at: row.created_at as string,
        requester,
      };
    })
    .filter(Boolean) as IncomingFriendRequest[];
}

export async function acceptFriendRequest(requestId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Brak sesji. Zaloguj się ponownie.');

  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', requestId)
    .eq('friend_id', user.id);

  if (error) throw toFriendlyError(error);
}

export async function rejectFriendRequest(requestId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Brak sesji. Zaloguj się ponownie.');

  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', requestId)
    .eq('friend_id', user.id);

  if (error) throw toFriendlyError(error);
}

export async function listAcceptedFriends(): Promise<FriendProfile[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data: relations, error: relationsError } = await supabase
    .from('friendships')
    .select('user_id, friend_id')
    .eq('status', 'accepted')
    .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

  if (relationsError) throw toFriendlyError(relationsError);

  const friendIds = (relations ?? [])
    .map((relation) => (relation.user_id === user.id ? relation.friend_id : relation.user_id))
    .filter(Boolean);

  if (friendIds.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase.rpc('get_public_profiles_by_ids', {
    profile_ids: friendIds,
  });

  if (profilesError) throw toFriendlyError(profilesError);

  return ((profiles ?? []) as PublicProfileRpcRow[])
    .map((row) => mapPublicProfileRow(row))
    .filter(Boolean) as FriendProfile[];
}

export async function removeFriend(friendId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Brak sesji. Zaloguj się ponownie.');
  if (!friendId.trim()) throw new Error('Brak identyfikatora znajomego.');

  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('status', 'accepted')
    .or(
      `and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`
    );

  if (error) throw toFriendlyError(error);
}

async function getPublicProfileById(profileId: string): Promise<FriendProfile | null> {
  const normalized = profileId.trim();
  if (!normalized) return null;

  const { data, error } = await supabase.rpc('get_public_profiles_by_ids', {
    profile_ids: [normalized],
  });

  if (error) throw toFriendlyError(error);
  const profile = Array.isArray(data) ? (data[0] as PublicProfileRpcRow | undefined) : undefined;
  return mapPublicProfileRow(profile as PublicProfileRpcRow);
}

export async function previewProfileQr(profileId: string): Promise<PreviewProfileQrResult> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Brak sesji. Zaloguj się ponownie.');

  const normalized = profileId.trim();
  if (!normalized) return { status: 'invalid_profile', profile: null };
  if (normalized === user.id) return { status: 'own_profile', profile: null };

  const profile = await getPublicProfileById(normalized);
  if (!profile) return { status: 'invalid_profile', profile: null };
  return { status: 'ok', profile };
}

export async function sendFriendRequestByProfileQr(profileId: string): Promise<{
  result: SendFriendRequestResult | 'invalid_profile' | 'own_profile';
  profile: FriendProfile | null;
}> {
  const preview = await previewProfileQr(profileId);
  if (preview.status === 'invalid_profile') {
    return { result: 'invalid_profile', profile: null };
  }
  if (preview.status === 'own_profile') {
    return { result: 'own_profile', profile: null };
  }
  if (!preview.profile) {
    return { result: 'invalid_profile', profile: null };
  }

  const result = await sendFriendRequest(preview.profile.id);
  return { result, profile: preview.profile };
}

export async function createFriendInviteToken(
  channel: InviteChannel
): Promise<FriendInviteTokenPayload> {
  const { data, error } = await supabase.rpc('create_friend_invite', {
    invite_channel: channel,
  });

  if (error) throw toFriendlyError(error);

  const payload = Array.isArray(data) ? data[0] : data;
  if (!payload?.invite_token || !payload?.expires_at) {
    throw new Error('Nie udało się utworzyć zaproszenia. Spróbuj ponownie.');
  }

  return {
    token: payload.invite_token as string,
    expiresAt: payload.expires_at as string,
  };
}

export async function redeemFriendInviteToken(token: string): Promise<{
  result: RedeemInviteResult;
  inviterProfile: FriendProfile | null;
}> {
  const normalizedToken = token.trim();
  if (normalizedToken.length < 16) {
    return { result: 'invalid_or_expired', inviterProfile: null };
  }

  const { data, error } = await supabase.rpc('redeem_friend_invite', {
    invite_token: normalizedToken,
  });

  if (error) {
    const message = mapFriendshipErrorMessage(error);
    if (
      message.includes('expired') ||
      message.includes('invalid') ||
      message.includes('already used')
    ) {
      return { result: 'invalid_or_expired', inviterProfile: null };
    }
    if (message.includes('own invite')) {
      return { result: 'own_invite', inviterProfile: null };
    }
    throw new Error(message);
  }

  const payload = Array.isArray(data) ? data[0] : data;
  if (!payload?.result) {
    return { result: 'invalid_or_expired', inviterProfile: null };
  }

  const result = payload.result as RedeemInviteResult;
  const inviterId = payload.friend_id as string | null;

  if (!inviterId) {
    return { result, inviterProfile: null };
  }

  const { data: inviterProfiles, error: profileError } = await supabase.rpc('get_public_profiles_by_ids', {
    profile_ids: [inviterId],
  });

  if (profileError) throw toFriendlyError(profileError);
  const inviter = (Array.isArray(inviterProfiles)
    ? (inviterProfiles[0] as PublicProfileRpcRow | undefined)
    : null) ?? null;
  if (!inviter?.username) return { result, inviterProfile: null };

  const mapped = mapPublicProfileRow(inviter as PublicProfileRpcRow);
  return {
    result,
    inviterProfile: mapped,
  };
}
