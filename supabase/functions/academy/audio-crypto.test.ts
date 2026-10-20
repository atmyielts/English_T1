import {openAudio,protectAudio} from './audio-crypto.ts';
const assert=(value:unknown)=>{if(!value)throw Error('Private audio assertion failed');};
const secret=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
async function refuses(action:()=>Promise<unknown>){try{await action();}catch{return;}throw Error('Expected private audio refusal');}
Deno.test('stored recording is ciphertext and round trips only for its bound record',async()=>{
 const key=secret(),plain=new TextEncoder().encode('Owned synthetic spoken response'),context='private-bucket:owned-academy/owned-recording';
 const first=await protectAudio(key,plain.buffer,context),second=await protectAudio(key,plain.buffer,context);
 assert(new TextDecoder().decode(first).startsWith('SCHOODAUDIO1'));assert(!new TextDecoder().decode(first).includes('Owned synthetic spoken response'));
 assert(first.some((byte,index)=>byte!==second[index]));assert(new TextDecoder().decode(await openAudio(key,first,context))==='Owned synthetic spoken response');
 await refuses(()=>openAudio(key,first,'private-bucket:other-academy/other-recording'));
 await refuses(()=>openAudio(secret(),first,context));
});
Deno.test('tampering, truncated storage and missing encryption configuration fail closed',async()=>{
 const key=secret(),body=new TextEncoder().encode('Owned synthetic audio'),context='owned-audio';const stored=await protectAudio(key,body.buffer,context);
 stored[stored.length-1]^=1;await refuses(()=>openAudio(key,stored,context));await refuses(()=>openAudio(key,stored.slice(0,20),context));
 await refuses(()=>protectAudio('',body.buffer,context));await refuses(()=>openAudio('',stored,context));
});
Deno.test('the maximum recording size round trips exactly inside the bounded storage envelope',async()=>{
 const key=secret(),plain=new Uint8Array(20*1024*1024);plain[0]=0x52;plain[plain.length-1]=0x7f;
 const stored=await protectAudio(key,plain.buffer,'owned-max-recording');assert(stored.length<=20971600);
 const decoded=await openAudio(key,stored,'owned-max-recording');assert(decoded.length===plain.length&&decoded[0]===0x52&&decoded[decoded.length-1]===0x7f);
});
