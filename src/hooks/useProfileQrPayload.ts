import { useMemo } from 'react';
import { useAuth } from './useAuth';
import { buildProfileQrLink } from '../lib/friendInvite';

export function useProfileQrPayload() {
  const { user } = useAuth();

  return useMemo(() => {
    if (!user?.id) return null;
    return buildProfileQrLink(user.id);
  }, [user?.id]);
}
