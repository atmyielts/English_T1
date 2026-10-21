import { legacyBoundaryPolicy } from './legacy-boundary-policy.ts';
import { effectiveLegacyMembership } from './legacy-scope-profile.ts';
import type { MembershipRow } from './access.ts';

type Row = Record<string, unknown>;
type Result = { data: unknown; error: {code?: string} | null };
type Db = { from: (name: string) => any; rpc: (name: string, args?: Row) => PromiseLike<Result> };
type Context = { academy_id: string; actor_id: string; action: string; mode: string; authorities: unknown[]; entries: Row[]; generation?: number; relationships?:Relationships };
const relations = new Set<string>(legacyBoundaryPolicy.relations);
const viewName = (name: string) => 'academy_scope_' + name;
const readActions = legacyBoundaryPolicy.readActions as Record<string, readonly string[]>;
const writeActions = legacyBoundaryPolicy.writeActions as Record<string, readonly string[]>;
export const legacyActionMode = (action: string): 'read' | 'write' | null => readActions[action] ? 'read' : writeActions[action] ? 'write' : null;

// Preserve the JSON aliases expected by existing callers when embeddings use
// the private scope views instead of their underlying business tables.
type Relationships=Record<string,Record<string,string>>;
export function scopeLegacySelection(columns: string, parent?:string, relationships:Relationships={}): string {
  const pieces:string[]=[];let depth=0,quote='',begin=0;
  for(let at=0;at<columns.length;at++){
    const char=columns[at];
    if(quote){if(char===quote&&columns[at-1]!=='\\')quote='';continue;}
    if(char==='"'){quote=char;continue;}
    if(char==='(')depth++;else if(char===')')depth--;
    else if(char===','&&depth===0){pieces.push(columns.slice(begin,at));begin=at+1;}
  }
  pieces.push(columns.slice(begin));
  return pieces.map(piece=>{
    const match=/^(\s*)(?:([a-zA-Z_][a-zA-Z_0-9]*):)?([a-z_][a-z_0-9]*)((?:![a-zA-Z_0-9]+)*)\s*\(([\s\S]*)\)(\s*)$/.exec(piece);
    if(!match)return piece;
    const [,space,alias,table,hint,children,tail]=match;
    if(table.startsWith('academy_')&&!relations.has(table))throw new LegacyBoundaryError(503,'This workspace is temporarily unavailable.');
    if(!relations.has(table))return piece;
    const defaultHint=parent&&relationships[parent]?.[table];
    const relationshipHint=hint&&hint!=='!inner'?hint:defaultHint?'!'+defaultHint+(hint||''):hint;
    return space+(alias??table)+':'+viewName(table)+relationshipHint+'('+scopeLegacySelection(children,table,relationships)+')'+tail;
  }).join(',');
}

export class LegacyBoundaryError extends Error {
  constructor(readonly status: number, message = 'Your current access does not cover this workspace.') { super(message); }
}

// PostgREST returns database refusals as values. Preserve their meaning before
// older handlers can turn a denied write/read into a retryable server error.
function guardLegacyQuery<T>(builder:T):T {
  if(!builder||typeof (builder as {then?:unknown}).then!=='function')return builder;
  return new Proxy(builder as object,{
    get(target,property){
      if(property==='then')return(resolve:unknown,reject:unknown)=>Promise.resolve(target).then(value=>{
        const result=value as {error?:{code?:string}};
        if(result?.error?.code==='42501')throw new LegacyBoundaryError(403);
        if(['22023','22P02'].includes(result?.error?.code??''))throw new LegacyBoundaryError(400,'Review the workspace values.');
        if(['23505','23P01'].includes(result?.error?.code??''))throw new LegacyBoundaryError(409,'This record changed or conflicts with another record. Refresh and review it.');
        return value;
      }).then(resolve as (value:unknown)=>unknown,reject as (error:unknown)=>unknown);
      const value=Reflect.get(target,property,target);
      return typeof value==='function'?(...args:unknown[])=>guardLegacyQuery(Reflect.apply(value,target,args)):value;
    },
  }) as T;
}

export async function openLegacyBoundary<T extends Db>(
  factory: (headers: Record<string, string>) => T,
  input: {academy: string; actor: string; action: string; mode: 'read' | 'write'; branch?: unknown; classroom?: unknown},
) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(input.academy) || !uuid.test(input.actor) || !(input.mode === 'read' ? readActions[input.action] : writeActions[input.action])) throw new LegacyBoundaryError(403);
  if (input.branch != null && input.branch !== '' && (typeof input.branch !== 'string' || !uuid.test(input.branch))) throw new LegacyBoundaryError(400, 'Choose a permitted branch.');
  if (input.classroom != null && input.classroom !== '' && (typeof input.classroom !== 'string' || !uuid.test(input.classroom))) throw new LegacyBoundaryError(400, 'Choose a permitted classroom.');
  const client = factory({
    'x-schood-legacy-academy': input.academy, 'x-schood-legacy-actor': input.actor,
    'x-schood-legacy-action': input.action, 'x-schood-legacy-mode': input.mode,
    'x-schood-scope-academy': input.academy, 'x-schood-scope-actor': input.actor,
    'x-schood-scope-mode': input.mode,
    ...(input.branch ? {'x-schood-legacy-branch': String(input.branch)} : {}),
    ...(input.branch ? {'x-schood-scope-branch': String(input.branch)} : {}),
    ...(input.classroom ? {'x-schood-legacy-classroom': String(input.classroom)} : {}),
  });
  async function context(includeRelationships=false): Promise<Context> {
    let result: Result;
    try { result = await client.rpc('academy_legacy_boundary_context',{p_relationships:includeRelationships}); }
    catch { throw new LegacyBoundaryError(503, 'Unable to load this workspace. Try again.'); }
    if (result.error) throw new LegacyBoundaryError(result.error.code === '42501' ? 403 : 503);
    const value = result.data as Context | null;
    if (!value || value.academy_id !== input.academy || value.actor_id !== input.actor || value.action !== input.action || value.mode !== input.mode || !Array.isArray(value.authorities) || !Array.isArray(value.entries) || !value.entries.length) throw new LegacyBoundaryError(503, 'Unable to load this workspace. Try again.');
    return value;
  }
  const initial = await context(true);
  const db = new Proxy(client, {
    get(target, property) {
      if (property === 'academyLegacyReadBoundary') return input.mode === 'read';
      if (property === 'from') return (table: string) => {
        if (!relations.has(table)) throw new LegacyBoundaryError(503, 'This workspace is temporarily unavailable.');
        const base = target.from(table), scoped = target.from(viewName(table));
        return new Proxy(base, {
          get(builder, method) {
            if (method === 'select') return (columns = '*', options?: unknown) => guardLegacyQuery(scoped.select(scopeLegacySelection(columns,table,initial.relationships), options));
            const value = Reflect.get(builder, method, builder);
            if (['insert','upsert','update','delete'].includes(String(method))) {
              if (input.mode === 'read' && !(input.action === 'education_os' && table === 'academy_action_items')) throw new LegacyBoundaryError(403);
              return typeof value === 'function' ? (...args:unknown[])=>guardLegacyQuery(Reflect.apply(value,builder,args)) : value;
            }
            return typeof value === 'function' ? value.bind(builder) : value;
          },
        });
      };
      if (property === 'rpc') return (name: string, args?: Row) => {
        if (input.mode === 'read' && ['ensure_academy_crm_defaults','ensure_academy_operations_defaults'].includes(name)) return Promise.resolve({data:null,error:null});
        if (name === 'academy_global_search_v2') return guardLegacyQuery(target.rpc('academy_legacy_global_search', args));
        return guardLegacyQuery(target.rpc(name, args));
      };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return {
    db,
    membership(original: MembershipRow): MembershipRow {
      const entries = initial.entries.map(entry => ({...entry, tenant_id: input.academy, status:'active'} as MembershipRow));
      const allEntries=initial.authorities.map(entry=>({...entry as Row,source:'grant',tenant_id:input.academy,status:'active'} as MembershipRow));
      const presented={...effectiveLegacyMembership(original,allEntries),legacy_original_access:undefined};
      presented.source=(initial.authorities as Row[]).find(entry=>entry.role===presented.role)?.source as MembershipRow['source']??presented.source;
      return {...effectiveLegacyMembership(original,entries),legacy_original_access:presented} as MembershipRow;
    },
    async verifyCurrent() {
      const current = await context();
      if (JSON.stringify(current.authorities) !== JSON.stringify(initial.authorities) || (input.mode === 'read' && current.generation !== initial.generation)) throw new LegacyBoundaryError(403, 'Your access changed. Refresh this workspace.');
    },
  };
}
