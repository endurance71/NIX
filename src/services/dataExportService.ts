import { supabase } from '../lib/supabase';
import type { DataExportJob } from '../types/database.types';
import type { Database } from '../types/database.generated';
import { recordProductEvent } from './productAnalyticsService';

function decodeExportJob(job: Database['public']['Tables']['data_export_jobs']['Row']): DataExportJob {
  const status = job.status;
  switch (status) {
    case 'queued':
    case 'processing':
    case 'ready':
    case 'failed':
    case 'expired':
      return { ...job, status };
    default:
      throw new Error('EXPORT_STATUS_INVALID');
  }
}

export async function listDataExportJobs(): Promise<DataExportJob[]> {
  const { data, error } = await supabase
    .from('data_export_jobs')
    .select('*')
    .order('requested_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []).map(decodeExportJob);
}

export async function requestDataExport(): Promise<DataExportJob> {
  const { data, error } = await supabase.rpc('request_data_export');
  if (error) throw error;
  void recordProductEvent('data_export_requested');
  return decodeExportJob(data);
}

async function functionErrorCode(error: unknown): Promise<string | null> {
  const context = (error as { context?: unknown } | null)?.context;
  if (!(context instanceof Response)) return null;
  try {
    const body = await context.clone().json();
    return typeof body?.code === 'string' ? body.code : null;
  } catch {
    return null;
  }
}

export async function createDataExportDownloadUrl(jobId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('data-export-download', {
    body: { job_id: jobId },
  });
  if (error) throw new Error((await functionErrorCode(error)) ?? 'EXPORT_DOWNLOAD_FAILED');
  if (typeof data?.signed_url !== 'string') {
    const code = typeof data?.code === 'string' ? data.code : 'EXPORT_DOWNLOAD_FAILED';
    throw new Error(code);
  }
  return data.signed_url;
}
