import type { BrowserEventKind } from './types';
import type { ProctorRuntime } from './runtime';
/** Browser interactions only: not device lockdown and not findings of misconduct. */
export function attachBrowserSignals(runtime: ProctorRuntime) {
  const removers:(()=>void)[]=[];
  const listen=(target:Window|Document,event:string,kind:BrowserEventKind|(()=>BrowserEventKind))=>{
    const listener=()=>void runtime.emit(typeof kind==='function'?kind():kind);
    target.addEventListener(event,listener);removers.push(()=>target.removeEventListener(event,listener));
  };
  listen(window,'blur','focus_loss');listen(window,'focus','focus_return');
  listen(document,'visibilitychange',()=>document.hidden?'tab_hidden':'tab_visible');
  listen(document,'fullscreenchange',()=>document.fullscreenElement?'fullscreen_enter':'fullscreen_exit');
  for(const event of ['copy','paste','cut','context_menu'] as const)listen(document,event==='context_menu'?'contextmenu':event,event);
  listen(window,'online','online');listen(window,'offline','offline');void runtime.emit('client_loaded');
  return()=>{for(const remove of removers)remove();};
}
