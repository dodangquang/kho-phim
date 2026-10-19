'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function fail(message){console.error(message);process.exit(1)}
const args=process.argv.slice(2);
if(args.length!==3)fail('Usage: node tools/configure-sync.cjs web-config.json mobile-google-services.json tv-google-services.json');
const [web,mobile,tv]=args.map(p=>JSON.parse(fs.readFileSync(path.resolve(p),'utf8')));
for(const field of ['apiKey','authDomain','projectId','appId'])if(typeof web[field]!=='string'||!web[field].trim())fail('Missing public Firebase web field: '+field);
if(!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(web.projectId)||web.authDomain!==web.projectId+'.firebaseapp.com')fail('Expected the Firebase project auth domain.');
function android(config,packageName){
 if(config.packageName===packageName&&config.projectId===web.projectId&&config.apiKey&&/^1:\d+:android:[a-f0-9]+$/.test(config.appId||'')){
  return {enabled:true,apiKey:config.apiKey,projectId:web.projectId,appId:config.appId,accountUrl:'https://khophimqd.vercel.app/account/'};
 }
 if(config.project_info?.project_id!==web.projectId)fail('All apps must use the same Firebase project.');
 const client=config.client?.find(c=>c.client_info?.android_client_info?.package_name===packageName);
 const apiKey=client?.api_key?.[0]?.current_key,appId=client?.client_info?.mobilesdk_app_id;
 if(!apiKey||!appId)fail('Missing registered Android app '+packageName);
 return {enabled:true,apiKey,projectId:web.projectId,appId,accountUrl:'https://khophimqd.vercel.app/account/'};
}
const result={enabled:true,apiKey:web.apiKey,authDomain:web.authDomain,projectId:web.projectId,appId:web.appId,accountUrl:'https://khophimqd.vercel.app/account/'};
const nativeMobile=android(mobile,'com.phimmoi.mobile'),nativeTv=android(tv,'com.phimmoitv.app');
fs.writeFileSync(path.join(root,'docs/sync/config.js'),'// Public Firebase app identifiers only. Never put a service-account key here.\nwindow.KHO_SYNC_CONFIG = '+JSON.stringify(result,null,2)+';\n');
for(const [dir,config]of [['mobile-android',nativeMobile],['tv',nativeTv]])fs.writeFileSync(path.join(root,dir,'app/src/main/assets/firebase-config.json'),JSON.stringify(config,null,2)+'\n');
console.log('Configured shared history for project '+web.projectId+'. Deploy firestore.rules and enable Google + Anonymous Authentication before publishing.');
