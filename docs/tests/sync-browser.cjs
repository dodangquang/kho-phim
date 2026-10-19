'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'../..');
function fields(data){return Object.fromEntries(Object.entries(data).map(([k,v])=>[k,typeof v==='number'?{integerValue:String(v)}:typeof v==='boolean'?{booleanValue:v}:{stringValue:String(v)}]));}
function decode(doc){return Object.fromEntries(Object.entries(doc.fields||{}).map(([k,v])=>[k,v.integerValue!=null?Number(v.integerValue):v.booleanValue!=null?v.booleanValue:v.stringValue??v.timestampValue]));}
async function main(){
 const server=http.createServer((req,res)=>{
  let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const docs=new Map(),reads=[],writes=[];let revision=0,anonymous=0,conflictInjected=false;
 let browser;
 try{
  browser=process.argv.includes('--webkit')?await webkit.launch({headless:true}):await chromium.launch({channel:'msedge',headless:true});
  async function device(mobile=false,seed=false){
   const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1366,height:900},isMobile:mobile,hasTouch:mobile});
   await context.route('**/sync/config.js*',route=>route.fulfill({contentType:'text/javascript',body:'window.KHO_SYNC_CONFIG='+JSON.stringify({enabled:true,apiKey:'fixture',projectId:'demo-khophim',authDomain:'demo-khophim.firebaseapp.com',appId:'fixture',accountUrl:origin+'/docs/account/'})}));
   await context.route('https://www.gstatic.com/firebasejs/**',route=>route.fulfill({contentType:'text/javascript',body:route.request().url().includes('firebase-app-')?`window.firebase={initializeApp:function(){},auth:function(){return {languageCode:'vi',setPersistence:function(){return Promise.resolve()},signInWithPopup:function(){var uid=window.__googleUser||'alice',result={user:{uid:uid},credential:{idToken:'google-'+uid}};return window.__holdGoogle?new Promise(function(resolve){window.__finishGoogle=function(){resolve(result)}}):Promise.resolve(result)}}}};firebase.auth.Auth={Persistence:{NONE:'none'}};firebase.auth.GoogleAuthProvider=function(){this.setCustomParameters=function(){}};`:''}));
   await context.route('https://identitytoolkit.googleapis.com/**',route=>{
    const data=route.request().postDataJSON(),signup=route.request().url().includes('signUp');
    const uid=signup?'anon'+(++anonymous):new URLSearchParams(data.postBody).get('id_token').replace('google-','');
    return route.fulfill({json:{localId:uid,idToken:'fixture-'+uid,refreshToken:'refresh-'+uid,expiresIn:'3600',displayName:uid==='alice'?'Tài khoản thử Alice':'Tài khoản thử Bob'}});
   });
   await context.route('https://securetoken.googleapis.com/**',route=>{const uid=new URLSearchParams(route.request().postData()).get('refresh_token').replace('refresh-','');return route.fulfill({json:{user_id:uid,id_token:'fixture-'+uid,refresh_token:'refresh-'+uid,expires_in:'3600'}});});
   await context.route('https://firestore.googleapis.com/**',async route=>{
    const req=route.request(),url=new URL(req.url()),uid=(req.headers().authorization||'').replace('Bearer fixture-',''),prefix='/v1/projects/demo-khophim/databases/(default)/documents';
    const pathname=url.pathname.slice(prefix.length).replace(/^\//,''),body=req.method()==='GET'||req.method()==='DELETE'?null:req.postDataJSON();
    function reply(status,json){return route.fulfill({status,json});}
    function allowed(p){return p.startsWith('users/'+uid+'/')||p.startsWith('pairings/');}
    if(!uid)return reply(401,{error:{message:'UNAUTHENTICATED'}});
    if(pathname.endsWith(':runQuery')){
     const parent=pathname.replace(':runQuery','')+'/history/';reads.push({uid,parent,incremental:!!body.structuredQuery.where});
     if(!allowed(parent))return reply(403,{error:{message:'PERMISSION_DENIED'}});
     let rows=[...docs.entries()].filter(([p])=>p.startsWith(parent)).map(([,document])=>({document}));
     if(body.structuredQuery.where){const threshold=Date.parse(body.structuredQuery.where.fieldFilter.value.timestampValue);rows=rows.filter(r=>Date.parse(decode(r.document).updatedAt)>threshold).sort((a,b)=>Date.parse(decode(a.document).updatedAt)-Date.parse(decode(b.document).updatedAt));}
     else rows.sort((a,b)=>decode(b.document).timestamp-decode(a.document).timestamp);
     return reply(200,rows.slice(0,body.structuredQuery.limit));
    }
    if(pathname===':commit'){
     for(const write of body.writes){
      const p=write.update.name.split('/documents/')[1],previous=docs.get(p);
      if(!allowed(p))return reply(403,{error:{message:'PERMISSION_DENIED'}});
      if(p==='users/alice/history/race-film'&&!conflictInjected){
       conflictInjected=true;const remote={...decode(write.update),positionMs:4000,episodeSlug:'tap-remote',timestamp:decode(write.update).timestamp+5};
       docs.set(p,{name:write.update.name,fields:{...fields(remote),updatedAt:{timestampValue:new Date().toISOString()}},updateTime:'v'+(++revision)});return reply(409,{error:{message:'ABORTED'}});
      }
      if((write.currentDocument?.exists===false&&previous)||(write.currentDocument?.updateTime&&previous?.updateTime!==write.currentDocument.updateTime))return reply(409,{error:{message:'ABORTED'}});
      const value={name:write.update.name,fields:{...write.update.fields},updateTime:'v'+(++revision)};
      for(const transform of write.updateTransforms||[])value.fields[transform.fieldPath]={timestampValue:new Date().toISOString()};
      docs.set(p,value);writes.push({uid,path:p,data:decode(value)});
     }
     return reply(200,{writeResults:[]});
    }
    const p=decodeURIComponent(pathname);if(!allowed(p))return reply(403,{error:{message:'PERMISSION_DENIED'}});
    if(req.method()==='GET'){const value=docs.get(p);return value?reply(200,value):reply(404,{error:{message:'NOT_FOUND'}});}
    if(req.method()==='DELETE'){docs.delete(p);return reply(200,{});}
    if(req.method()==='PATCH'){
     const previous=docs.get(p);if((url.searchParams.get('currentDocument.exists')==='false'&&previous)||(url.searchParams.has('currentDocument.updateTime')&&previous?.updateTime!==url.searchParams.get('currentDocument.updateTime')))return reply(409,{error:{message:'ABORTED'}});
     const value={name:'projects/demo-khophim/databases/(default)/documents/'+p,fields:body.fields,updateTime:'v'+(++revision)};docs.set(p,value);writes.push({uid,path:p,data:decode(value)});return reply(200,value);
    }
    return reply(400,{error:{message:'UNSUPPORTED_TEST_REQUEST'}});
   });
   await context.route('https://khophimqd.vercel.app/source/**',route=>route.fulfill({json:{status:true,items:[],data:{items:[],params:{pagination:{totalPages:1}}}}}));
   await context.route('https://cdn.phimsrv.com/**',route=>route.abort());
   if(seed)await context.addInitScript(()=>localStorage.setItem('khophim_history',JSON.stringify([{movieSlug:'phim-2026',movieTitle:'Phim thử đồng bộ',episodeSlug:'tap-2',episodeName:'Tập 2',serverName:'Thuyết Minh',currentTime:65,duration:120,timestamp:Date.now()-1000}])));
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));return {context,page,errors};
  }
  async function login(page,back,user='alice'){
   await page.goto(origin+'/docs/account/?return='+encodeURIComponent(back));await page.evaluate(user=>{window.__googleUser=user},user);
   await page.getByRole('button',{name:'Tiếp tục với Google',exact:true}).click();await page.waitForURL(origin+back);
   await page.waitForFunction(()=>window.KhoSync?.user()?.uid===window.__expectedUid||window.KhoSync?.user());
  }
  const canceled=await device(true);await canceled.page.goto(origin+'/docs/account/');
  await canceled.page.evaluate(()=>{window.__holdGoogle=true});
  await canceled.page.getByRole('button',{name:'Tiếp tục với Google',exact:true}).click();
  await canceled.page.getByRole('button',{name:'Hủy đăng nhập',exact:true}).click();
  await canceled.page.evaluate(()=>window.__finishGoogle());
  assert.equal(await canceled.page.evaluate(()=>KhoSync.user()),null,'A canceled popup must not activate a late account');
  await canceled.page.getByRole('button',{name:'Tiếp tục với Google',exact:true}).waitFor({state:'visible'});
  assert.equal(await canceled.page.getByRole('button',{name:'Tiếp tục với Google',exact:true}).isEnabled(),true);
  await canceled.context.close();
  const mobile=await device(true,true);await login(mobile.page,'/docs/?mode=mobile');
  await mobile.page.evaluate(()=>KhoSync.sync());
  assert.equal(decode(docs.get('users/alice/history/phim-2026')).positionMs,65000);
  assert.equal(decode(docs.get('users/alice/history/phim-2026')).serverName,'Thuyết Minh');
  const desktop=await device();await login(desktop.page,'/docs/desktop/');await desktop.page.evaluate(()=>KhoSync.sync());
  assert.equal(await desktop.page.evaluate(()=>KhoSync.history()[0].positionMs),65000);
  await desktop.page.evaluate(()=>{KhoSync.save({movieSlug:'phim-2026',movieTitle:'Phim thử đồng bộ',episodeSlug:'tap-3',episodeName:'Tập 3',serverName:'Vietsub',positionMs:15000,durationMs:120000});return KhoSync.sync()});
  await mobile.page.evaluate(()=>KhoSync.sync());assert.deepEqual(await mobile.page.evaluate(()=>{const r=KhoSync.history()[0];return [r.positionMs,r.episodeSlug,r.serverName]}),[15000,'tap-3','Vietsub']);
  // A disconnected device retries its outbox and receives an explicit delete.
  await mobile.context.setOffline(true);await mobile.page.evaluate(()=>{KhoSync.save({movieSlug:'offline-film',movieTitle:'Ngoại tuyến',positionMs:30000});return KhoSync.sync()});
  assert.equal(await mobile.page.evaluate(()=>KhoSync.history()[0].movieSlug),'offline-film');await mobile.context.setOffline(false);await mobile.page.evaluate(()=>KhoSync.sync());
  assert.equal(decode(docs.get('users/alice/history/offline-film')).positionMs,30000);
  await desktop.page.evaluate(()=>KhoSync.sync());await desktop.page.evaluate(()=>{KhoSync.remove('offline-film');return KhoSync.sync()});await mobile.page.evaluate(()=>KhoSync.sync());assert.equal(await mobile.page.evaluate(()=>KhoSync.history().some(r=>r.movieSlug==='offline-film')),false);
  // QR pairing follows the same account route; only ciphertext enters Firestore.
  const tv=await device();await tv.page.goto(origin+'/docs/tv/');await tv.page.locator('[data-tab="settings"]').click();await tv.page.locator('[data-sync-login]').click();
  const link=tv.page.locator('.sync-pair-link');await link.waitFor({state:'visible'});const pairUrl=await link.getAttribute('href');assert.match(pairUrl,/#pair=.+&key=/);
  const phone=await device(true);await phone.page.goto(pairUrl);await phone.page.getByRole('button',{name:'Tiếp tục với Google và liên kết thiết bị',exact:true}).click();
  await phone.page.getByText('Đã xác nhận tài khoản.',{exact:false}).waitFor();await tv.page.waitForFunction(()=>KhoSync.user()?.uid==='alice');
  assert.equal(writes.filter(w=>w.path.startsWith('pairings/')&&w.data.payload).every(w=>!JSON.stringify(w.data).includes('google-alice')),true);
  await tv.page.evaluate(()=>KhoSync.sync());assert.equal(await tv.page.evaluate(()=>KhoSync.history()[0].episodeSlug),'tap-3');
  const wrong=await tv.page.evaluate(async()=>{try{await KhoSync.acceptPairedGoogle('google-bob','alice');return false}catch(e){return KhoSync.user().uid==='alice'}});assert.equal(wrong,true,'A mismatched credential must not activate another account');
  await desktop.page.evaluate(()=>{KhoSync.save({movieSlug:'race-film',movieTitle:'Race',positionMs:90000});return KhoSync.sync()});
  assert.equal(conflictInjected,true);assert.equal(await desktop.page.evaluate(()=>KhoSync.history().find(r=>r.movieSlug==='race-film').positionMs),4000,'CAS retry preserves a newer viewing action even at an earlier playback time');
  await mobile.page.evaluate(()=>KhoSync.signOut());assert.equal(await mobile.page.evaluate(()=>KhoSync.history().length),0);
  await login(mobile.page,'/docs/?mode=mobile','bob');await mobile.page.evaluate(()=>KhoSync.sync());assert.equal(await mobile.page.evaluate(()=>KhoSync.history().length),0,'Alice history must not migrate into Bob');
  assert.equal(reads.some(r=>r.uid==='bob'&&r.parent.startsWith('users/alice/')),false);
  assert.equal(reads.some(r=>r.incremental),true,'Polling uses server update cursors');
  await desktop.page.evaluate(()=>{KhoSync.clear();return KhoSync.sync()});await tv.page.evaluate(()=>KhoSync.sync());assert.equal(await tv.page.evaluate(()=>KhoSync.history().length),0);
  for(const d of [mobile,desktop,tv,phone])assert.deepEqual(d.errors,[]);
  if(process.env.KHOPHIM_TEST_OUTPUT)await tv.page.screenshot({path:path.join(process.env.KHOPHIM_TEST_OUTPUT,'google-sync-tv-fixture.png')});
  console.log('PASS sync: Google UI, guest migration, mobile ↔ desktop ↔ TV, episode/server/ms, offline retry, deletes/clear, QR encryption, account isolation ('+(process.argv.includes('--webkit')?'WebKit':'Edge')+')');
  for(const d of [mobile,desktop,tv,phone])await d.context.close();
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
