import test from 'node:test';
import assert from 'node:assert/strict';
const {loadWebsiteContent}=await import(process.env.CRAFT_MODULE_PATH || new URL('../lib/craft-content.ts', import.meta.url).href);
test('Craft website content configuration and validation',async()=>{
 const originalFetch=globalThis.fetch;
 const settings={url:process.env.CRAFT_CONTENT_URL,token:process.env.CRAFT_CONTENT_TOKEN,mode:process.env.NODE_ENV};
 const defaults={hero:{headline:'Existing headline',description:'Existing description'}};
 try{
  delete process.env.CRAFT_CONTENT_URL;delete process.env.CRAFT_CONTENT_TOKEN;
  assert.equal(await loadWebsiteContent('qfast',defaults),defaults);
  process.env.CRAFT_CONTENT_URL='http://localhost/content-export.json';
  await assert.rejects(loadWebsiteContent('qfast',defaults),/incomplete/);
  process.env.CRAFT_CONTENT_TOKEN='test-only';process.env.NODE_ENV='test';
  let payload={version:1,project:'qfast',entries:[{key:'hero',headline:'Edited in Craft',description:'Published description'}]};
  let options;
  globalThis.fetch=async(_url,opts)=>{options=opts;return new Response(JSON.stringify(payload),{status:200})};
  assert.equal((await loadWebsiteContent('qfast',defaults)).hero.headline,'Edited in Craft');
  assert.equal(options.headers.Authorization,'Bearer test-only');assert.equal(options.redirect,'error');
  payload.project='escriben';await assert.rejects(loadWebsiteContent('qfast',defaults),/contract mismatch/);
  payload.project='qfast';payload.entries.push(payload.entries[0]);await assert.rejects(loadWebsiteContent('qfast',defaults),/duplicate/);
  payload.entries=[];await assert.rejects(loadWebsiteContent('qfast',defaults),/missing/);
  globalThis.fetch=async()=>new Response('',{status:403});await assert.rejects(loadWebsiteContent('qfast',defaults),/403/);
  process.env.NODE_ENV='production';await assert.rejects(loadWebsiteContent('qfast',defaults),/HTTPS/);
 }finally{
  globalThis.fetch=originalFetch;
  for(const [key,value] of Object.entries({CRAFT_CONTENT_URL:settings.url,CRAFT_CONTENT_TOKEN:settings.token,NODE_ENV:settings.mode})) {
   if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
 }
});
