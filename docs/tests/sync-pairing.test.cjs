'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const scope={crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,Promise,btoa,atob};scope.window=scope;
vm.runInNewContext(fs.readFileSync(require('node:path').resolve(__dirname,'../sync/pairing.js'),'utf8'),scope);
test('pairing encrypts the short-lived Google credential with a random GCM nonce',async()=>{
 const key=Buffer.alloc(32,7).toString('base64url'),value={googleIdToken:'test-credential',uid:'alice'};
 const a=await scope.KhoPairing.encrypt(value,key),b=await scope.KhoPairing.encrypt(value,key);
 assert.notEqual(a.payload,b.payload);assert.equal(JSON.stringify(a).includes('test-credential'),false);
 assert.equal(JSON.stringify(await scope.KhoPairing.decrypt(a,key)),JSON.stringify(value));
 assert.equal(a.iv.length,16);
});
test('wrong device key and tampered ciphertext never yield a credential',async()=>{
 const key=Buffer.alloc(32,7).toString('base64url'),a=await scope.KhoPairing.encrypt({uid:'alice',googleIdToken:'test'},key);
 await assert.rejects(scope.KhoPairing.decrypt(a,Buffer.alloc(32,8).toString('base64url')));
 const modified=Buffer.from(a.payload,'base64url');modified[0]^=1;
 await assert.rejects(scope.KhoPairing.decrypt({...a,payload:modified.toString('base64url')},key));
});
