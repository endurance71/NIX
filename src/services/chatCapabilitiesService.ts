import { supabase } from '../lib/supabase';
import { parseChatCapabilities, type ChatCapabilities } from '../lib/chatCapabilities';

/** PostgREST „function not found”: the backend does not have 20261012101000 yet. */
function isMissingRpc(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST202' || error.code === '42883';
}

/**
 * What this backend supports in the 1:1 chat. A backend without the migration answers with
 * „nothing” (features hidden, no errors); a network failure throws so the query keeps its last
 * known answer instead of flipping features off while offline.
 */
export async function fetchChatCapabilities(): Promise<ChatCapabilities> {
  const { data, error } = await supabase.rpc('get_chat_capabilities');
  if (error) {
    if (isMissingRpc(error)) return parseChatCapabilities(null);
    throw error;
  }
  return parseChatCapabilities(data);
}
