/** Endpoint signing secrets: generated here, shown once, stored only as
 * AES-GCM ciphertext `v1:<key id>:<iv>:<ciphertext>` under rotating keys. */
const b64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
const unb64=(text:string)=>Uint8Array.from(atob(text),char=>char.charCodeAt(0));
export class WebhookSecretBox {
  private constructor(private active:string,private keys:Map<string,CryptoKey>){}
  static async create(active:string,material:Record<string,string>){
    const keys=new Map<string,CryptoKey>();
    for(const [id,value] of Object.entries(material)){
      if(!/^[a-z0-9-]{1,40}$/.test(id))throw new Error('Webhook key ids must be short lowercase identifiers.');
      const raw=unb64(value);if(raw.length!==32)throw new Error('Webhook keys must be 32 bytes.');
      keys.set(id,await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']));
    }
    if(!keys.has(active))throw new Error('The active webhook key is not configured.');
    return new WebhookSecretBox(active,keys);
  }
  static generate(){return 'whsec_'+b64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
  async seal(secret:string){
    const iv=crypto.getRandomValues(new Uint8Array(12)),data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(this.active)},this.keys.get(this.active)!,new TextEncoder().encode(secret));
    return `v1:${this.active}:${b64(iv)}:${b64(new Uint8Array(data))}`;
  }
  async open(sealed:string){
    const [version,id,iv,data]=sealed.split(':');const key=this.keys.get(id);
    if(version!=='v1'||!key||!iv||!data)throw new Error('Webhook secret cannot be opened with the configured keys.');
    return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:new TextEncoder().encode(id)},key,unb64(data)));
  }
}
