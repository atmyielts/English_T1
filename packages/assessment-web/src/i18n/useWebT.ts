import {useT} from '../../../service-i18n/src/i18n.tsx';
import type {WebKey} from './catalog.ts';
import type {Translate} from './translate.ts';
/** Shared components and hooks translate only shared keys; both apps merge them. */
export const useWebT = (): Translate => useT<WebKey>();
