'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const H = require('../sync/history.js');
function fixture() {
  const values = new Map(); let clock = 1000;
  return { store: new H.Store({getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)},()=>++clock), values };
}
const row = (slug,time,position=65000,extra={}) => H.normalize({movieSlug:slug,movieTitle:slug,episodeSlug:'tap-2',episodeName:'Tập 2',serverName:'Thuyết Minh',positionMs:position,durationMs:120000,timestamp:time,...extra});
test('normalizes seconds on mobile and milliseconds on TV/Android into the same schema',()=>{
  assert.deepEqual(H.normalize({movieSlug:'phim-2026',movieTitle:'Phim',currentTime:65,duration:120,timestamp:123}),H.normalize({slug:'phim-2026',title:'Phim',positionMs:65000,durationMs:120000,updatedAt:123}));
  assert.equal(H.normalize({slug:'../escape'}),null);
  assert.equal(H.normalize({slug:'phim',poster:'javascript:alert(1)',positionMs:Infinity}).posterUrl,'');
});
test('the last viewing action wins even when the viewer seeks backwards or changes episode/server',()=>{
  const latest=row('phim',20,15000,{episodeSlug:'tap-3',serverName:'Vietsub'});
  assert.deepEqual(H.merge([row('phim',10,65000)],[latest],0),[latest]);
});
test('merge is deterministic across order and delete wins timestamp ties',()=>{
  const a=row('phim',20,5000),b=row('phim',20,6000);
  assert.deepEqual(H.merge([a],[b],0),H.merge([b],[a],0));
  assert.equal(H.merge([a],[{...b,deleted:true}],0)[0].deleted,true);
});
test('guest migration preserves old cache without timestamps and runs once',()=>{
  const {store}=fixture(); store.migrate([[{slug:'legacy',title:'Phim cũ'}]]);
  store.migrate([[row('other',300)]]);assert.equal(store.history()[0].movieSlug,'legacy');
});
test('login imports guest once; logout and another account never expose its history',()=>{
  const {store}=fixture();store.save(row('guest-film',1));store.switchOwner('alice',true);
  assert.equal(store.history().length,1);store.save(row('alice-film',2));
  store.switchOwner('guest',false);assert.equal(store.history().length,0);
  store.switchOwner('bob',true);assert.equal(store.history().length,0);
  store.switchOwner('alice',false);assert.equal(store.history().length,2);
});
test('offline deletes and clear watermark prevent stale devices resurrecting history',()=>{
  const {store}=fixture();store.switchOwner('alice',false);store.save(row('phim',1));store.remove('phim');
  store.reconcile([row('phim',1)],0);assert.equal(store.history().length,0);
  store.clear();store.reconcile([row('old-device',20)],0);assert.equal(store.history().length,0);
  store.save(row('watched-again',2));assert.equal(store.history()[0].movieSlug,'watched-again');
});
test('a delayed acknowledgement cannot discard progress saved during sync',()=>{
  const {store}=fixture();store.switchOwner('alice',false);store.save(row('phim',1,10000));
  const old=store.history()[0];store.save(row('phim',1,20000));
  store.reconcile([old],0);store.ack(old.movieSlug,old.timestamp);
  assert.equal(store.history()[0].positionMs,20000);
  assert.equal(store.read().dirty.phim,store.history()[0].timestamp);
});
test('a newer remote delete removes an older local pending save',()=>{
  const {store}=fixture();store.switchOwner('alice',false);store.save(row('phim',1));
  store.reconcile([row('phim',2000,0,{deleted:true})],0);
  assert.equal(store.history().length,0);assert.equal(store.read().dirty.phim,undefined);
});
test('history displays only the newest 60 films and escapes untrusted labels',()=>{
  const {store}=fixture();for(let i=0;i<100;i++)store.save(row('phim-'+i,1));
  assert.equal(store.history().length,60);assert.equal(store.history()[0].movieSlug,'phim-99');
  assert.equal(H.escape('<img src=x onerror="x">'),'&lt;img src=x onerror=&quot;x&quot;&gt;');
});
