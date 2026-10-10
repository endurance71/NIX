import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.3';
import { json } from '../_shared/http.ts';
import { handleCleanupTextMessages } from './handler.ts';

Deno.serve((req) => {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'SERVER_CONFIG_MISSING' }, 500);
  const service = createClient(url, serviceKey);

  return handleCleanupTextMessages(req, serviceKey, {
    async listExpiredIds(limit) {
      const { data, error } = await service
        .from('text_messages')
        .select('id')
        .lt('expires_at', new Date().toISOString())
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map((row) => row.id as string);
    },
    async deleteIds(ids) {
      const { error, count } = await service
        .from('text_messages')
        .delete({ count: 'exact' })
        .in('id', ids);
      if (error) throw error;
      return count ?? ids.length;
    },
  });
});
