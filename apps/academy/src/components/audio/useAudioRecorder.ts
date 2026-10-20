import {useCallback,useEffect,useRef,useState} from 'react';

export function useAudioRecorder(onReady:(file:File,revision:number)=>void){
 const [status,setStatus]=useState<'idle'|'requesting'|'recording'>('idle'),[seconds,setSeconds]=useState(0),[error,setError]=useState('');
 const stream=useRef<MediaStream|null>(null),recorder=useRef<MediaRecorder|null>(null),generation=useRef(0),mounted=useRef(true),timer=useRef<ReturnType<typeof setInterval>|null>(null);
 const release=useCallback(()=>{if(timer.current){clearInterval(timer.current);timer.current=null;}stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;},[]);
 const invalidate=useCallback(()=>{generation.current++;},[]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(recorder.current?.state==='recording')recorder.current.stop();else invalidate();release();};},[release,invalidate]);
 useEffect(()=>{if(status==='idle')return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};addEventListener('beforeunload',warn);return()=>removeEventListener('beforeunload',warn);},[status]);
 const cancel=()=>{generation.current++;if(recorder.current?.state==='recording')recorder.current.stop();release();setStatus('idle');setSeconds(0);};
 const start=async()=>{
  if(status!=='idle')return;const visit=++generation.current,revision=Date.now();setError('');
  if(typeof MediaRecorder==='undefined'||!navigator.mediaDevices?.getUserMedia){setError('Recording is unavailable. Choose an audio file instead.');return;}
  setStatus('requesting');
  try{
   const captured=await navigator.mediaDevices.getUserMedia({audio:true});if(visit!==generation.current){captured.getTracks().forEach(track=>track.stop());return;}
   stream.current=captured;const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(type=>MediaRecorder.isTypeSupported(type));
   const recording=new MediaRecorder(captured,mime?{mimeType:mime,audioBitsPerSecond:64000}:undefined);recorder.current=recording;const chunks:Blob[]=[];let bytes=0;
   recording.ondataavailable=event=>{if(visit!==generation.current)return;if(event.data.size){bytes+=event.data.size;if(bytes>20*1024*1024){generation.current++;recording.stop();release();setStatus('idle');setError('The recording is too large. Choose a shorter response.');return;}chunks.push(event.data);}};
   recording.onerror=()=>{if(visit!==generation.current)return;generation.current++;release();setStatus('idle');setError('Recording stopped unexpectedly. Try again or choose an audio file.');};
   recording.onstop=()=>{if(visit!==generation.current)return;release();if(mounted.current)setStatus('idle');if(!chunks.length){if(mounted.current)setError('The recording is empty. Try again.');return;}
    const type=recording.mimeType||chunks[0].type,extension=type.includes('mp4')?'m4a':type.includes('ogg')?'ogg':'webm';onReady(new File(chunks,'recording.'+extension,{type,lastModified:revision}),revision);};
   let elapsed=0;setSeconds(0);recording.start(1000);setStatus('recording');timer.current=setInterval(()=>{elapsed++;setSeconds(elapsed);if(elapsed>=180&&recording.state==='recording')recording.stop();},1000);
  }catch{if(visit===generation.current){release();setStatus('idle');setError('Microphone access is unavailable. Allow access or choose an audio file.');}}
 };
 return {status,seconds,error,start,stop:()=>{if(recorder.current?.state==='recording')recorder.current.stop();},cancel};
}
