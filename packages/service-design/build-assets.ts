import {readFileSync} from 'node:fs';
/** Build-time asset packaging only; never imported by service UI or the mother platform. */
export function schoodDesignAssets(){
 return {name:'schood-design-licenses',generateBundle(){
  const emitter=this as unknown as {emitFile(asset:{type:'asset';fileName:string;source:string}):void};
  for(const file of ['Manrope-OFL.txt','Sora-OFL.txt'])emitter.emitFile({type:'asset',fileName:`licenses/${file}`,source:readFileSync(new URL(`./assets/${file}`,import.meta.url),'utf8')});
 }};
}
