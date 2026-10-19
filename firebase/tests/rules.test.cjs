'use strict';
const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,getDocs,collection,deleteDoc,serverTimestamp,Timestamp,updateDoc}=require('firebase/firestore');
let env;
const google=uid=>env.authenticatedContext(uid,{firebase:{sign_in_provider:'google.com'}}).firestore();
const anonymous=uid=>env.authenticatedContext(uid,{firebase:{sign_in_provider:'anonymous'}}).firestore();
const row=(extra={})=>({movieSlug:'phim-2026',movieTitle:'Phim',posterUrl:'https://phimimg.com/poster.jpg',bannerUrl:'',episodeSlug:'tap-2',episodeName:'Tập 2',serverName:'Thuyết Minh',positionMs:65000,durationMs:120000,timestamp:Date.now(),deleted:false,updatedAt:serverTimestamp(),...extra});
const pairId='Abcdefghijklmnopqrstuv';
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-khophim',firestore:{host:'127.0.0.1',port:8089,rules:fs.readFileSync(path.resolve(__dirname,'../firestore.rules'),'utf8')}});});
beforeEach(async()=>{await env.clearFirestore();});
after(async()=>{await env.cleanup();});
test('Google user can store and read only their own history',async()=>{
 const alice=google('alice'),bob=google('bob');await assertSucceeds(setDoc(doc(alice,'users/alice/history/phim-2026'),row()));
 await assertSucceeds(getDoc(doc(alice,'users/alice/history/phim-2026')));
 await assertFails(getDoc(doc(bob,'users/alice/history/phim-2026')));await assertFails(setDoc(doc(bob,'users/alice/history/phim-2026'),row()));
 await assertFails(getDocs(collection(bob,'users/alice/history')));
});
test('guest, anonymous pairing session, and other providers cannot read or write history',async()=>{
 for(const db of [env.unauthenticatedContext().firestore(),anonymous('alice'),env.authenticatedContext('alice',{firebase:{sign_in_provider:'password'}}).firestore()]){
  await assertFails(getDoc(doc(db,'users/alice/history/phim-2026')));await assertFails(setDoc(doc(db,'users/alice/history/phim-2026'),row()));
 }
});
test('invalid shapes, document slug mismatch and future poisoning are rejected',async()=>{
 const ref=doc(google('alice'),'users/alice/history/phim-2026');
 for(const bad of [{movieSlug:'other'}, {positionMs:-1}, {timestamp:Date.now()+3600000}, {extraField:'secret'}, {posterUrl:'javascript:alert(1)'}])await assertFails(setDoc(ref,row(bad)));
});
test('old offline writes cannot overwrite a newer save or tombstone',async()=>{
 const ref=doc(google('alice'),'users/alice/history/phim-2026'),now=Date.now();await assertSucceeds(setDoc(ref,row({timestamp:now,deleted:true})));
 await assertFails(setDoc(ref,row({timestamp:now-1})));await assertFails(deleteDoc(ref));
});
test('clear watermark is private and monotonic',async()=>{
 const a=doc(google('alice'),'users/alice/meta/history');await assertSucceeds(setDoc(a,{clearedAt:Date.now()}));
 await assertFails(setDoc(a,{clearedAt:0}));await assertFails(getDoc(doc(google('bob'),'users/alice/meta/history')));
});
async function createPair(db=anonymous('device')){
 const ref=doc(db,'pairings/'+pairId);await assertSucceeds(setDoc(ref,{ownerUid:'device',createdAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+300000)}));return ref;
}
test('pairing is private to its anonymous receiver and authenticated Google claimant; listing is denied',async()=>{
 await createPair();await assertSucceeds(getDoc(doc(google('alice'),'pairings/'+pairId)));
 await assertFails(getDoc(doc(anonymous('other-device'),'pairings/'+pairId)));
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'pairings/'+pairId)));
 await assertFails(getDocs(collection(google('alice'),'pairings')));
});
test('pairing rejects forged owners, short guessable IDs and excessive lifetime',async()=>{
 const db=anonymous('device');
 for(const [id,extra] of [[pairId,{ownerUid:'other'}],['123456',{ownerUid:'device'}],[pairId,{expiresAt:Timestamp.fromMillis(Date.now()+3600000)}]]){
  await assertFails(setDoc(doc(db,'pairings/'+id),{ownerUid:'device',createdAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+300000),...extra}));
 }
});
test('Google claim is single-use and cannot change receiver, expiry, or sender identity',async()=>{
 await createPair();const ref=doc(google('alice'),'pairings/'+pairId);const claim={senderUid:'alice',payload:'encrypted-credential',iv:'abcdefghijklmnop',claimedAt:serverTimestamp()};
 await assertFails(updateDoc(ref,{...claim,senderUid:'bob'}));await assertFails(updateDoc(ref,{...claim,ownerUid:'alice'}));
 await assertSucceeds(updateDoc(ref,claim));await assertFails(updateDoc(ref,claim));
});
test('expired pairing cannot be read or claimed by Google and unrelated users cannot delete it',async()=>{
 await env.withSecurityRulesDisabled(async context=>{await setDoc(doc(context.firestore(),'pairings/'+pairId),{ownerUid:'device',createdAt:Timestamp.fromMillis(Date.now()-500000),expiresAt:Timestamp.fromMillis(Date.now()-1)});});
 const ref=doc(google('alice'),'pairings/'+pairId);await assertFails(getDoc(ref));await assertFails(updateDoc(ref,{senderUid:'alice',payload:'x',iv:'abcdefghijklmnop',claimedAt:serverTimestamp()}));
 await assertFails(deleteDoc(doc(anonymous('other-device'),'pairings/'+pairId)));await assertSucceeds(deleteDoc(doc(anonymous('device'),'pairings/'+pairId)));
});
test('receiver and confirmed Google account can clean up a claimed pairing',async()=>{
 await createPair();await updateDoc(doc(google('alice'),'pairings/'+pairId),{senderUid:'alice',payload:'ciphertext',iv:'abcdefghijklmnop',claimedAt:serverTimestamp()});
 await assertFails(deleteDoc(doc(google('bob'),'pairings/'+pairId)));await assertSucceeds(deleteDoc(doc(google('alice'),'pairings/'+pairId)));
});
