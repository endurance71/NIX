import { useAuth } from './useAuth';
import { buildProfileQrLink } from '../lib/friendInvite';

export function useProfileQrPayload() {
  const { user } = useAuth();

  if (!user?.id) return null;
  return buildProfileQrLink(user.id);
}
