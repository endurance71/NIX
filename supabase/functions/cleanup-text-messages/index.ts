import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase environment variables' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    let totalDeleted = 0;
    let batchDeleted = 0;
    const batchSize = 500;

    do {
      const { data: expiredBatch, error: selectError } = await serviceClient
        .from('text_messages')
        .select('id')
        .lt('expires_at', new Date().toISOString())
        .limit(batchSize);

      if (selectError) {
        throw selectError;
      }

      if (!expiredBatch || expiredBatch.length === 0) {
        break;
      }

      const idsToDelete = expiredBatch.map((item) => item.id);
      const { error: deleteError, count } = await serviceClient
        .from('text_messages')
        .delete({ count: 'exact' })
        .in('id', idsToDelete);

      if (deleteError) {
        throw deleteError;
      }

      batchDeleted = count ?? idsToDelete.length;
      totalDeleted += batchDeleted;
    } while (batchDeleted >= batchSize);

    return new Response(JSON.stringify({ ok: true, deletedCount: totalDeleted }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('cleanup-text-messages error:', error);
    return new Response(JSON.stringify({ error: error.message ?? 'Unknown cleanup error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
