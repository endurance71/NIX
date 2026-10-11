// Audit evidence: deterministic execution of the real TypeScript services.
// SQLite, SecureStore, cryptography and network are controlled mocks.
// This proves ordering/identity bugs; it does not test native AES or production.
// Run from any directory: node <path-to-this-file> (dependencies must be installed).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root,'node_modules/typescript'));
function loader(mocks) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(root,file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = {exports:{}}; cache.set(file,module);
    const code = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    const req = (name) => {
      if (name in mocks) return mocks[name];
      if (name.startsWith('.')) {
        const absolute = path.resolve(path.dirname(file),name)+'.ts';
        if (absolute in mocks) return mocks[absolute];
        return load(absolute);
      }
      throw Error('Unexpected import '+name);
    };
    vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(req,module,module.exports);
    return module.exports;
  }
  return load;
}
let generated = 0;
function cryptoMocks() {
  return {AESEncryptionKey:{generate:async()=>({id:'key-'+(++generated),encoded:async function(){return this.id}}),import:async id=>({id})},AESKeySize:{AES256:256},AESSealedData:{fromCombined:x=>x},aesEncryptAsync:async(bytes,key)=>({combined:()=>JSON.stringify({key:key.id,text:new TextDecoder().decode(bytes)})}),aesDecryptAsync:async(value,key)=>{const parsed=JSON.parse(value);if(parsed.key!==key.id)throw Error('AES authentication failed');return new TextEncoder().encode(parsed.text)}};
}
async function cacheRace() {
  const rows = new Map(); const keys = new Map();
  const db={execAsync:async()=>{},runAsync:async(sql,...values)=>{
    if(sql.startsWith('INSERT INTO offline_query_cache')) {const [owner_id,query_key,category,scope_id,encrypted_payload,data_updated_at,cached_at]=values;rows.set(query_key,{owner_id,query_key,category,scope_id,encrypted_payload,data_updated_at,cached_at});}
    if(sql.startsWith('DELETE FROM offline_query_cache')) rows.clear();
  },getAllAsync:async()=>[...rows.values()]};
  const load=loader({'expo-crypto':cryptoMocks(),'expo-secure-store':{getItemAsync:async key=>keys.get(key)??null,setItemAsync:async(key,value)=>keys.set(key,value),deleteItemAsync:async key=>keys.delete(key)},'expo-sqlite':{openDatabaseAsync:async()=>db}});
  const {offlineCacheStore}=load('src/lib/offlineCacheStore.ts');
  generated=0;
  await Promise.all([offlineCacheStore.write('owner-A',['acceptedFriends'],[{id:'friend'}],1),offlineCacheStore.write('owner-A',['currentUserProfile','owner-A'],{username:'alice'},2)]);
  const countBefore=rows.size;
  let failure;
  try {await offlineCacheStore.read('owner-A')} catch(error) {failure=error.message;}
  assert.equal(generated,2); assert.equal(countBefore,2); assert.equal(rows.size,0); assert.equal(failure,'AES authentication failed');
  console.log('CACHE_KEY_RACE',JSON.stringify({generatedKeys:generated,cachedRowsBeforeRead:countBefore,decryptFailure:failure,cachedRowsAfterRead:rows.size}));
}
async function accountRace(moderationEnabled = true) {
  generated=0;
  const keys=new Map([['nix.text-outbox.key.v1.owner-A','key-A']]);
  const rows=new Map(); const payloads=[{receiverId:'common-peer',body:'A private message 1'},{receiverId:'common-peer',body:'A private message 2'}];
  payloads.forEach((payload,i)=>rows.set('job-'+i,{id:'job-'+i,owner_id:'owner-A',encrypted_payload:JSON.stringify({key:'key-A',text:JSON.stringify(payload)}),state:'pending',attempt_count:0,next_attempt_at:0,created_at:i,updated_at:i,expires_at:Date.now()+86400000,error_code:null}));
  const db={execAsync:async()=>{},runAsync:async(sql,...args)=>{
    if(sql==='DELETE FROM text_outbox WHERE owner_id = ?')rows.clear();
    if(sql==='DELETE FROM text_outbox WHERE id = ?')rows.delete(args[0]);
  },getAllAsync:async()=>[...rows.values()]};
  let currentOwner='owner-A'; let releaseFirst; let firstStarted;
  const started=new Promise(resolve=>firstStarted=resolve); const firstResponse=new Promise(resolve=>releaseFirst=resolve);
  const requests=[]; const directInserts=[];
  const supabase={auth:{getSession:async()=>({data:{session:{user:{id:currentOwner}}}}),getUser:async()=>({data:{user:{id:currentOwner}}})},rpc:async(name,body)=>{
    if(name==='enqueue_own_text_moderation_job'){
      requests.push({actor:currentOwner,name,body});
      if(requests.length===1){firstStarted();return firstResponse;}
      return moderationEnabled ? {data:{status:'approved',jobId:'moderation-B'},error:null} : {data:null,error:{message:'MODERATION_DISABLED'}};
    }
    if(name==='get_own_text_moderation_job')return {data:{status:'approved',messageId:'message-B'},error:null};
    throw Error(name);
  },from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:'message-B',sender_id:currentOwner,body:'A private message 2'},error:null})})}),insert:(row)=>{directInserts.push({actor:currentOwner,row});return {select:()=>({single:async()=>({data:{id:'message-B',...row},error:null})})}}})};
  const load=loader({'expo-crypto':cryptoMocks(),'expo-secure-store':{getItemAsync:async key=>keys.get(key)??null,setItemAsync:async(key,value)=>keys.set(key,value),deleteItemAsync:async key=>keys.delete(key)},'expo-sqlite':{openDatabaseAsync:async()=>db},[path.join(root,'src/lib/supabase.ts')]:{supabase},[path.join(root,'src/lib/avatarEmoji.ts')]:{normalizeAvatarEmoji:x=>x},[path.join(root,'src/services/productAnalyticsService.ts')]:{recordProductEvent:async()=>{}}});
  const service=load('src/services/textOutboxService.ts');
  const flush=service.flushTextOutbox('owner-A');
  await started;
  await service.clearTextOutbox('owner-A');
  currentOwner='owner-B';
  releaseFirst({data:null,error:{message:'UNAUTHORIZED'}});
  const sentIds=await flush;
  assert.equal(requests[1].actor,'owner-B'); assert.equal(requests[1].body.p_body,'A private message 2');assert.deepEqual(sentIds,['job-1']);
  if(!moderationEnabled){assert.equal(directInserts[0].actor,'owner-B');assert.equal(directInserts[0].row.sender_id,'owner-B');assert.equal(directInserts[0].row.body,'A private message 2');}
  console.log('OUTBOX_ACCOUNT_RACE',JSON.stringify({moderationEnabled,outboxRowsAfterLogout:rows.size,requests,directInserts,sentIds}));
}
(async()=>{await cacheRace();await accountRace(true);await accountRace(false)})().catch(error=>{console.error(error);process.exitCode=1});
