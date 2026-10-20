const magic=new TextEncoder().encode('SCHOODAUDIO1');
async function keyFor(value:string){
 if(!/^[A-Za-z0-9_-]{43}$/.test(value))throw Error('Private audio encryption is unavailable');
 const bytes=Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')+'='),character=>character.charCodeAt(0));
 if(bytes.byteLength!==32)throw Error('Private audio encryption is unavailable');
 return crypto.subtle.importKey('raw',bytes,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
export async function protectAudio(secret:string,plain:ArrayBuffer,context:string){
 const iv=crypto.getRandomValues(new Uint8Array(12)),key=await keyFor(secret);
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(context)},key,plain));
 const stored=new Uint8Array(magic.length+iv.length+encrypted.length);stored.set(magic);stored.set(iv,magic.length);stored.set(encrypted,magic.length+iv.length);return stored;
}
export async function openAudio(secret:string,stored:Uint8Array<ArrayBuffer>,context:string){
 if(stored.length<magic.length+12+16||magic.some((value,index)=>stored[index]!==value))throw Error('Private audio data is invalid');
 const key=await keyFor(secret);return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:stored.slice(magic.length,magic.length+12),additionalData:new TextEncoder().encode(context)},key,stored.slice(magic.length+12)));
}
