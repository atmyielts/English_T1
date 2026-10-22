import {ServiceRequestError} from '../client';
import type {Params} from '../../../service-i18n/src/format.ts';
import {LocalizedError,localizeText,type Translate} from './translate.ts';
/** Prefer a translated message for a known server error code; otherwise keep
 * the server's own explanation so nothing is hidden from the user. */
export function errorText(cause:unknown,t:Translate,fallbackKey:string='error.generic'){
  const lookup=t as unknown as (key:string,params?:Params)=>string;
  if(cause instanceof LocalizedError)return cause.render(t);
  if(cause instanceof ServiceRequestError&&cause.code){const key=`error.${cause.code}`,text=lookup(key);if(text!==key)return text;}
  if(cause instanceof Error&&cause.message){const key=`error.${cause.message}`,text=lookup(key);if(text!==key)return text;return localizeText(cause.message,t);}
  return lookup(fallbackKey);
}
