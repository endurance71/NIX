import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import ts from 'typescript';
import { buildSafePsqlEnv } from './lib/safe-psql-env.mjs';
import { parseLocalTypeDatabase } from './lib/local-type-database.mjs';

// Introspect an isolated/local migrated database; never the linked project.
const target = parseLocalTypeDatabase(process.env.NIX_TYPES_DB_URL);
const sql = `
SELECT json_build_object(
 'types', (SELECT json_agg(json_build_object('oid',t.oid,'name',t.typname,'schema',n.nspname,'kind',t.typtype,'element',t.typelem,'relation',t.typrelid)) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace),
 'relations', (SELECT json_agg(json_build_object('oid',c.oid,'name',c.relname,'kind',c.relkind,'columns',
   (SELECT json_agg(json_build_object('name',a.attname,'number',a.attnum,'type',a.atttypid,'required',a.attnotnull,'default',a.atthasdef,'generated',a.attgenerated<>'','identity',a.attidentity<>'') ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)))
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m')),
 'enums', (SELECT json_agg(json_build_object('name',t.typname,'values',(SELECT json_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid))) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e'),
 'functions', (SELECT json_agg(json_build_object('name',p.proname,'return',p.prorettype,'set',p.proretset,'defaults',p.pronargdefaults,'names',p.proargnames,'modes',p.proargmodes,'types',coalesce(p.proallargtypes,p.proargtypes::oid[]))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND p.prorettype NOT IN ('trigger'::regtype,'event_trigger'::regtype)),
 'relationships', (SELECT json_agg(json_build_object('table',c.conrelid,'name',c.conname,'columns',c.conkey,'target',c.confrelid,'targetColumns',c.confkey,'oneToOne',EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid=c.conrelid AND i.indisunique AND i.indkey::smallint[] @> c.conkey AND c.conkey @> i.indkey::smallint[]))) FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' AND c.contype='f')
);`;
const data = JSON.parse(execFileSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1',
  '-h', target.host, '-p', target.port, '-U', target.user,
  '-d', target.database, '-c', sql], {
  env: buildSafePsqlEnv(target.password), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
}));
const relations = data.relations ?? [];
const typeMap = new Map(data.types.map((type) => [type.oid, type]));
const quote = JSON.stringify;
function type(oid) {
  const item = typeMap.get(oid);
  if (!item) throw new Error(`Unknown PostgreSQL type ${oid}`);
  if (Number(item.element)) return `(${type(item.element)})[]`;
  if (item.kind === 'e' && item.schema === 'public') return `Database['public']['Enums'][${quote(item.name)}]`;
  const relation = relations.find((row) => row.oid === item.relation);
  if (relation) return `Database['public']['${['v', 'm'].includes(relation.kind) ? 'Views' : 'Tables'}'][${quote(relation.name)}]['Row']`;
  if (['json', 'jsonb'].includes(item.name)) return 'Json';
  if (item.name === 'bool') return 'boolean';
  if (['int2', 'int4', 'int8', 'float4', 'float8', 'numeric', 'money', 'oid'].includes(item.name)) return 'number';
  if (item.name === 'void') return 'undefined';
  if (['uuid', 'text', 'varchar', 'bpchar', 'char', 'name', 'date', 'timestamp', 'timestamptz', 'time', 'timetz', 'interval', 'bytea', 'inet', 'cidr', 'macaddr', 'xml', 'citext'].includes(item.name)) return 'string';
  return 'unknown';
}
function fields(columns, mode) {
  return (columns ?? []).map((column) => {
    const optional = mode === 'Update' || (mode === 'Insert' && (!column.required || column.default || column.identity || column.generated));
    const value = mode !== 'Row' && column.generated ? 'never' : `${type(column.type)}${column.required ? '' : ' | null'}`;
    return `${quote(column.name)}${optional ? '?' : ''}: ${value};`;
  }).join('\n');
}
function relationships(row) {
  const items = (data.relationships ?? []).filter((item) => item.table === row.oid && relations.some((target) => target.oid === item.target));
  return `[${items.map((item) => {
    const target = relations.find((other) => other.oid === item.target);
    const names = (numbers, rel) => numbers.map((number) => rel.columns.find((column) => column.number === number).name);
    return `{ foreignKeyName: ${quote(item.name)}; columns: ${JSON.stringify(names(item.columns, row))}; isOneToOne: ${item.oneToOne}; referencedRelation: ${quote(target.name)}; referencedColumns: ${JSON.stringify(names(item.targetColumns, target))}; }`;
  }).join(',')}]`;
}
const groups = new Map();
for (const fn of data.functions ?? []) {
  const args = fn.types.map((oid, index) => ({ type: type(oid), name: fn.names?.[index] || `arg${index + 1}`, mode: fn.modes?.[index] || 'i' }));
  const input = args.filter((arg) => ['i', 'b', 'v'].includes(arg.mode));
  const output = args.filter((arg) => ['o', 'b', 't'].includes(arg.mode));
  const returns = output.length ? `{${output.map((arg) => `${quote(arg.name)}: ${arg.type};`).join('')}}` : type(fn.return);
  const value = `{ Args: ${input.length ? `{${input.map((arg, index) => `${quote(arg.name)}${index >= input.length - fn.defaults ? '?' : ''}: ${arg.type} | null;`).join('')}}` : 'Record<PropertyKey, never>'}; Returns: ${fn.set ? `(${returns})[]` : returns}; }`;
  groups.set(fn.name, [...(groups.get(fn.name) ?? []), value]);
}
const sorted = (rows) => [...rows].sort((a, b) => a.name.localeCompare(b.name, 'en'));
const tables = sorted(relations.filter((row) => ['r', 'p'].includes(row.kind))).map((row) =>
  `${quote(row.name)}: { Row: {${fields(row.columns, 'Row')}}; Insert: {${fields(row.columns, 'Insert')}}; Update: {${fields(row.columns, 'Update')}}; Relationships: ${relationships(row)}; };`).join('\n');
const views = sorted(relations.filter((row) => ['v', 'm'].includes(row.kind))).map((row) =>
  `${quote(row.name)}: { Row: {${fields(row.columns, 'Row')}}; Relationships: []; };`).join('\n');
const functions = [...groups].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([name, overloads]) => `${quote(name)}: ${overloads.join(' | ')};`).join('\n');
const enums = sorted(data.enums ?? []).map((item) => `${quote(item.name)}: ${item.values.map(quote).join(' | ')};`).join('\n');
const file = `// Generated from the migrated PostgreSQL public catalog. Do not edit.\n// Regenerate: NIX_TYPES_DB_URL=<local DSN> npm run gen:database\nexport type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];\nexport type Database = { public: { Tables: {\n${tables}\n}; Views: ${views ? `{${views}}` : 'Record<never, never>'}; Functions: {\n${functions}\n}; Enums: ${enums ? `{${enums}}` : 'Record<never, never>'}; CompositeTypes: Record<never, never>; }; };\n`;
const ast = ts.createSourceFile('database.generated.ts', file, ts.ScriptTarget.Latest, true);
writeFileSync(new URL('../src/types/database.generated.ts', import.meta.url), ts.createPrinter().printFile(ast));
console.log(`Generated ${relations.length} public relations and ${groups.size} RPCs from the local migrated catalog.`);
