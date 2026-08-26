import { readFileSync } from 'node:fs';

const source = readFileSync('supabase/functions/report-content/index.ts', 'utf8');
const required = [
  "rpc('create_content_report_v2'",
  'validateReportPayload',
  'report.text_message_id',
];
const missing = required.filter((token) => !source.includes(token));
if (missing.length) {
  console.error(`report-content contract is incomplete: ${missing.join(', ')}`);
  process.exit(1);
}

if (/rpc\(\s*'create_content_report'\s*,/.test(source)) {
  console.error('report-content still calls the v1 create_content_report RPC.');
  process.exit(1);
}

const rpcIndex = source.indexOf("rpc('create_content_report_v2'");
const firstTextSelect = source.search(/\.from\(\s*'text_messages'\s*\)/);
if (firstTextSelect !== -1 && firstTextSelect < rpcIndex) {
  console.error('report-content reads text_messages before the authorized v2 RPC.');
  process.exit(1);
}

console.log('report-content authorization/retention contract passed.');
