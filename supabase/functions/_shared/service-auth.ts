import { getBearerToken } from './http.ts';

export function hasServiceRoleBearer(req: Request, serviceRoleKey: string | undefined) {
  if (!serviceRoleKey) return false;
  const token = getBearerToken(req);
  return token !== null && token === serviceRoleKey;
}
