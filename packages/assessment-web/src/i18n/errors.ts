import {ServiceRequestError} from '../client';
/** Prefer a translated message for a known server error code; otherwise keep
 * the server's own explanation so nothing is hidden from the user. */
export function errorText(cause:unknown,t:(key:string)=>string,fallbackKey='error.generic'){
  if(cause instanceof ServiceRequestError&&cause.code){const key=`error.${cause.code}`,text=t(key);if(text!==key)return text;}
  if(cause instanceof Error&&cause.message){const key=`error.${cause.message}`,text=t(key);if(text!==key)return text;return cause.message;}
  return t(fallbackKey);
}
