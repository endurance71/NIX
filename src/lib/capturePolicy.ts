import type { CapturePolicy } from '../services/capturePolicyService';

export function resolveCapturePolicyForFriend(
  policies: Record<string, CapturePolicy>,
  friendId: string
): CapturePolicy {
  return policies[friendId] ?? 'deny';
}

export function shouldBlockCapture(policy: CapturePolicy): boolean {
  return policy !== 'allow';
}
