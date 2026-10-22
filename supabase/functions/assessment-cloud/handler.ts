import { buildManifest, ContractError, hash, object, text, uuid, validateDefinition, validateItem, validateKey,type Definition,type Manifest } from "../../../packages/assessment-core/src/mod.ts";
import {validateRubric} from '../../../packages/assessment-core/src/grading.ts';
import {compareReviewMaterial,REVIEW_AREAS} from '../../../packages/assessment-core/src/item-diff.ts';
import {blueprintExample,hasBlueprint} from './blueprint-service.ts';
import {breakPolicy} from '../../../packages/assessment-core/src/accommodations.ts';

// Minimal repository boundary lets the request handler run against deterministic test doubles.
export interface Repository {
  user(token: string): Promise<string | null>;
  workspaces(user: string): Promise<Record<string, unknown>[]>;
  capability(tenant: string, user: string, capability: string): Promise<boolean>;
  list(table: string, tenant: string, filters?: Record<string, string>): Promise<Record<string, unknown>[]>;
  get(table: string, tenant: string, id: string): Promise<Record<string, unknown> | null>;
  versions(tenant: string, ids: string[]): Promise<Record<string, unknown>[]>;
  windowRequirements(tenant: string, ids: string[]): Promise<Record<string, unknown>[]>;
  key(tenant: string, itemVersion: string): Promise<Record<string, unknown> | null>;
  command(actor: string, tenant: string, key: string, action: string, data: Record<string, unknown>): Promise<unknown>;
  /** Question IDs at their exposure limit in the candidate's own sitting. */
  saturated?(tenant: string, actor: string, registration: string): Promise<string[]>;
}
import {captureBinding} from '../../../packages/assessment-core/src/capture-launch.ts';
import {IMAGE_RESPONSE_PROTOCOL} from '../../../packages/assessment-core/src/image-response.ts';
import {MEDIA_ANSWER_DELIVERY_PROTOCOL,MEDIA_RESPONSE_TYPES} from '../../../packages/assessment-core/src/media-answer.ts';
export interface HandlerOptions { repository: Repository; allowedOrigins: string[]; promptMediaEnabled?:boolean; captureLaunchEnabled?:boolean;imageResponsesEnabled?:boolean;mediaAnswersEnabled?:boolean }
const resourceTables: Record<string, { table: string; capability: string }> = {
  "item-banks": { table: "assessment_item_banks", capability: "banks.read" },
  "item-versions": { table: "assessment_item_versions", capability: "banks.read" },
  "rubrics": { table: "assessment_rubrics", capability: "banks.read" },
  "assessments": { table: "assessment_definitions", capability: "banks.read" },
  "assessment-revisions": { table: "assessment_definition_revisions", capability: "banks.read" },
  "assessment-versions": { table: "assessment_versions", capability: "banks.read" },
  "exam-windows": { table: "assessment_exam_windows", capability: "exams.manage" },
  "registrations": { table: "assessment_registrations", capability: "exams.manage" },
  "attempts": { table: "assessment_attempts", capability: "results.read" },
  "audit": { table: "assessment_audit_events", capability: "audit.read" },
};
const actionCapabilities: Record<string, string> = {
  "registration.accommodate":"exams.manage",
  "bank.create": "items.write", "rubric.create": "items.write", "item.create": "items.write", "item.revise": "items.write", "item.submit": "items.write", "item.approve": "items.approve", "item.request_changes": "items.approve", "assessment.create": "items.write", "assessment.revise": "items.write", "assessment.publish": "assessments.publish", "window.create": "exams.manage", "registration.create": "exams.manage",
};
const tablesForItemAction: Record<string, string> = { "item.revise": "assessment_items", "item.submit": "assessment_item_versions", "item.approve": "assessment_item_versions", "item.comment": "assessment_item_versions", "item.request_changes": "assessment_item_versions", "assessment.revise": "assessment_definitions", "assessment.publish": "assessment_definitions" };
function error(status: number, code: string, message: string): never { throw new ContractError(code, message, status); }
function timestamp(value: unknown, label: string): string {
  const raw = text(value, label, 80);
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(raw) || !Number.isFinite(Date.parse(raw))) error(422, "invalid_timestamp", `${label} requires an ISO timestamp with timezone`);
  return new Date(raw).toISOString();
}
function integer(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) error(422, "invalid_number", `${label} must be an integer from ${min} to ${max}`);
  return value as number;
}
export function createHandler({ repository, allowedOrigins, promptMediaEnabled=false, captureLaunchEnabled=false,imageResponsesEnabled=false,mediaAnswersEnabled=false }: HandlerOptions) {
  const unavailableTools=new Set(['audio_response','video_response','file_response']);
  async function delivery(tenant:string,actor:string,registrationId:string){
    const registration=await repository.get('assessment_registrations',tenant,registrationId);
    if(!registration||registration.candidate_id!==actor)error(404,'not_found','Registration not found');
    const window=await repository.get('assessment_exam_windows',tenant,String(registration!.window_id));
    const version=await repository.get('assessment_versions',tenant,String(window?.assessment_version_id));
    if(!version)error(404,'not_found','Assessment not found');
    const definition=validateDefinition(version!.definition),ids=definition.sections.flatMap(section=>section.item_version_ids);
    const items=(await repository.versions(tenant,ids)).map(row=>({id:String(row.id),item:validateItem(row.payload),key:{},created_by:String(row.created_by),approved_by:typeof row.approved_by==='string'?row.approved_by:''}));
    const mediaItems=items.filter(row=>(MEDIA_RESPONSE_TYPES as readonly string[]).includes(row.item.type));
    return {registration:registration!,version:version!,definition,items,requirements:{schema_version:'assessment.delivery-requirements.v1',prompt_media:[...new Set(items.flatMap(row=>row.item.media?.map(media=>media.kind)??[]))].sort(),response_tools:[...new Set(items.filter(row=>unavailableTools.has(row.item.type)&&(!mediaAnswersEnabled||!row.item.media_response)).map(row=>row.item.type))].sort(),prompt_media_enabled:promptMediaEnabled,image_response_tools:[...new Set(items.filter(row=>['hotspot','diagram_labeling'].includes(row.item.type)).map(row=>row.item.type))].sort(),image_responses_enabled:imageResponsesEnabled,image_response_protocol:IMAGE_RESPONSE_PROTOCOL,media_response_tools:[...new Set(mediaItems.map(row=>row.item.type))].sort(),media_responses_enabled:mediaAnswersEnabled,media_response_protocol:MEDIA_ANSWER_DELIVERY_PROTOCOL,media_capture_groups:mediaItems.filter(row=>row.item.media_response?.sources.includes('capture')&&!row.item.media_response.sources.includes('upload')).map(row=>({type:row.item.type,mimes:row.item.media_response!.mimes}))}};
  }
  async function reviewMaterial(tenant:string,item:Record<string,unknown>,key:Record<string,unknown>){
    const base={item:item.payload,key:key.key},rubricId=object(item.payload).rubric_id;
    if(!rubricId)return base;
    const row=await repository.get('assessment_rubrics',tenant,uuid(rubricId));if(!row)error(422,'invalid_rubric','The reviewed rubric is missing');
    return {...base,rubric:{id:row!.id,...validateRubric(row)}};
  }
  return async (req: Request): Promise<Response> => {
    const requestId = crypto.randomUUID();
    const origin = req.headers.get("origin");
    const headers: Record<string, string> = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Request-ID": requestId, "Vary": "Origin" };
    if (origin && allowedOrigins.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
    const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers });
    if (origin && !allowedOrigins.includes(origin)) return json(403, { code: "origin_denied", error: "Origin is not allowed", request_id: requestId });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...headers, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, apikey, content-type, idempotency-key, if-match, x-client-info" } });
    try {
      if (!["GET", "POST"].includes(req.method)) return json(405, { code: "method_not_allowed", error: "Method not allowed" });
      const match = /^Bearer (\S+)$/.exec(req.headers.get("authorization") ?? "");
      if (!match) error(401, "unauthorized", "Sign in to continue");
      const actor = await repository.user(match![1]);
      if (!actor) error(401, "unauthorized", "Sign in to continue");
      const url = new URL(req.url);
      const prefix = "/assessment-cloud";
      const path = url.pathname.slice(url.pathname.indexOf(prefix) + prefix.length).replace(/^\//, "");
      if (req.method === "GET" && path === "workspaces") return json(200, { data: await repository.workspaces(actor!) });
      const tenant = uuid(url.searchParams.get("tenant_id"), "Tenant ID");
      if (req.method === "GET") {
        if(path==='candidate/preparation'){
          const prepared=await delivery(tenant,actor!,uuid(url.searchParams.get('registration_id')));
          // Capability summary only: no future prompts, assets, option IDs or keys.
          return json(200,{data:prepared.requirements});
        }
        if (/^item-versions\/[^/]+\/review$/.test(path)) {
          if (!await repository.capability(tenant, actor!, "items.approve") && !await repository.capability(tenant, actor!, "items.write")) error(403, "forbidden", "Review access is required");
          const id = uuid(path.split("/")[1]);
          const item = await repository.get("assessment_item_versions", tenant, id);
          const key = await repository.key(tenant, id);
          if (!item || !key) error(404, "not_found", "Question not found");
          const material=await reviewMaterial(tenant,item!,key!);
          const parent=item!.item_id?await repository.get("assessment_items",tenant,uuid(item!.item_id)):null;
          // What changed since the previous version, and the review conversation
          // across all versions of this question.
          const versions=item!.item_id?await repository.list('assessment_item_versions',tenant,{item_id:String(item!.item_id)}):[];
          const previous=versions.filter(row=>Number(row.version)<Number(item!.version)).sort((a,b)=>Number(b.version)-Number(a.version))[0];
          let comparison:Record<string,unknown>|null=null;
          if(previous){const previousKey=await repository.key(tenant,String(previous.id));if(previousKey){let before:Awaited<ReturnType<typeof reviewMaterial>>;try{before=await reviewMaterial(tenant,previous,previousKey);}catch{before={item:previous.payload,key:previousKey.key};}// Compare meaning, not spelling: keys are normalized so saved defaults are not reported as changes.
            const normalized=(value:Awaited<ReturnType<typeof reviewMaterial>>)=>{try{return {...value,key:validateKey(validateItem(value.item),value.key)};}catch{return value;}};
            comparison={base_id:previous.id,base_version:previous.version,base_status:previous.status,...compareReviewMaterial(normalized(before),normalized(material))};}}
          const comments=item!.item_id?(await repository.list('assessment_item_review_comments',tenant,{item_id:String(item!.item_id)})).map(row=>{const version=versions.find(entry=>entry.id===row.item_version_id);return {id:row.id,item_version_id:row.item_version_id,version:version?.version??null,kind:row.kind,area:row.area,body:row.body,created_at:row.created_at,author:row.author_id===actor?'you':version&&row.author_id===version.created_by?'author':'reviewer'};}).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))||String(a.id).localeCompare(String(b.id))):[];
          return json(200, { data: { ...item, ...(parent?{bank_id:parent.bank_id}:{}), key: key!.key, ...('rubric' in material?{rubric:material.rubric}:{}), review_hash: await hash(material), comparison, comments } });
        }
        if (path === "candidate/registrations") {
          const registrations=await repository.list("assessment_registrations",tenant,{candidate_id:actor!});
          const windows=await repository.windowRequirements(tenant,[...new Set(registrations.map(row=>String(row.window_id)))]);
          const byId=new Map(windows.map(row=>[String(row.id),row]));
          return json(200,{data:registrations.map(row=>({...row,required_services:byId.get(String(row.window_id))?.required_services??[],title:byId.get(String(row.window_id))?.title??'Assessment registration'}))});
        }
        if (path.startsWith("candidate/attempts/")) {
          const id = uuid(path.split("/")[2], "Attempt ID");
          const attempt = await repository.get("assessment_attempts", tenant, id);
          if (!attempt || attempt.candidate_id !== actor) error(404, "not_found", "Attempt not found");
          const form = await repository.get("assessment_forms", tenant, String(attempt!.form_id));
          const responses = await repository.list("assessment_response_journal", tenant, { attempt_id: id });
          const manifest = object(form?.manifest);
          const sections = manifest.sections as unknown[];
          const sectionIndex = Number(attempt!.section_index);
          // Future prompts stay on the server even though the complete immutable form exists.
          return json(200, { data: { ...attempt, required_services:attempt!.required_services??[], manifest: { ...manifest, sections: [sections[sectionIndex]], section_count: sections.length }, manifest_hash: form?.manifest_hash, responses, server_time: new Date().toISOString() } });
        }
        const resource = resourceTables[path];
        if (!resource) error(404, "not_found", "Resource not found");
        if (!await repository.capability(tenant, actor!, resource.capability)) error(403, "forbidden", "You do not have permission for this resource");
        return json(200, { data: await repository.list(resource.table, tenant) });
      }
      if(path==='blueprints/preview'){
        if(!await repository.capability(tenant,actor!,"banks.read")||!await repository.capability(tenant,actor!,"items.write")&&!await repository.capability(tenant,actor!,"assessments.publish"))error(403,"forbidden","Blueprint preview requires question-bank and assessment author/publisher access.");
        const raw=await req.text();if(new TextEncoder().encode(raw).length>1000000)error(413,"payload_too_large","Blueprint preview exceeds 1 MB.");let payload:Record<string,unknown>;try{payload=object(JSON.parse(raw));}catch{error(400,"invalid_json","Expected a definition object.");}
        if(payload!.action!=='blueprint.preview')error(422,'invalid_blueprint_preview','Use the blueprint preview action.');
        const definition=validateDefinition(object(payload!.data).definition),example=await blueprintExample(repository,tenant,definition);
        return json(200,{data:{schema_version:'assessment.blueprint-preview.v1',feasible:true,sections:example.summary,notice:'A satisfying example only, not the actual candidate form. Difficulty labels are author estimates, not calibrated equivalence.'}});
      }
      if (path !== "commands") error(404, "not_found", "Resource not found");
      const key = text(req.headers.get("idempotency-key"), "Idempotency-Key", 200);
      if (key.length < 8) error(422, "invalid_key", "Idempotency-Key requires at least eight characters");
      const bodyText = await req.text();
      if (new TextEncoder().encode(bodyText).length > 1_000_000) error(413, "payload_too_large", "Request exceeds 1 MB");
      let body: Record<string, unknown>;
      try { body = object(JSON.parse(bodyText)); } catch { error(400, "invalid_json", "Expected a JSON object"); }
      const action = text(body!.action, "Action", 80);
      const data = object(body!.data);
      const cap = actionCapabilities[action];
      if (cap && !await repository.capability(tenant, actor!, cap)) error(403, "forbidden", "You do not have permission for this action");
      let input: Record<string, unknown>;
      switch (action) {
        case "bank.create": input = { title: text(data.title, "Bank title", 200) }; break;
        case "rubric.create": {
          input=validateRubric(data);break;
        }
        case "item.create": case "item.revise": {
          const item = validateItem(data.item);
          if(item.rubric_id){const rubric=await repository.get('assessment_rubrics',tenant,item.rubric_id);if(!rubric)error(422,'invalid_rubric','Rubric not found');validateRubric(rubric);}
          input = { item, key: validateKey(item, data.key), ...(action === "item.create" ? { bank_id: uuid(data.bank_id, "Bank ID") } : { item_id: uuid(data.item_id, "Item ID"), base_version_id: uuid(data.base_version_id, "Base version") }) }; break;
        }
        case "item.submit": input = { id: uuid(data.id) }; break;
        case "item.comment": case "item.request_changes": {
          const id = uuid(data.id), area = data.area ?? "general";
          if (area !== "general" && !(REVIEW_AREAS as readonly string[]).includes(String(area))) error(422, "invalid_review_area", "Choose what the comment is about");
          input = { id, area, body: text(data.body, "Comment", 5000) };
          if (action === "item.request_changes") {
            // Like approval, a change request names the exact material reviewed.
            const item = await repository.get("assessment_item_versions", tenant, id);
            const key = await repository.key(tenant, id);
            if (!item || !key) error(404, "not_found", "Question not found");
            if (data.review_hash !== await hash(await reviewMaterial(tenant,item!,key!))) error(409, "review_required", "Review the question, scoring key and rubric before requesting changes");
            input.review_hash = data.review_hash;
          }
          break;
        }
        case "item.approve": {
          const id = uuid(data.id);
          const item = await repository.get("assessment_item_versions", tenant, id);
          const key = await repository.key(tenant, id);
          if (!item || !key) error(404, "not_found", "Question not found");
          if (data.review_hash !== await hash(await reviewMaterial(tenant,item!,key!))) error(409, "review_required", "Review the question, scoring key and rubric before approval");
          input = { id, review_hash: data.review_hash }; break;
        }
        case "assessment.create": input = { definition: validateDefinition(data.definition) }; break;
        case "assessment.revise": input = { id: uuid(data.id), definition: validateDefinition(data.definition), revision: integer(Number(req.headers.get("if-match")), "Revision", 1, 1_000_000), reason: text(data.reason, "Revision reason", 2000) }; break;
        case "assessment.publish": input = { id: uuid(data.id), revision: integer(Number(req.headers.get("if-match")), "Revision", 1, 1_000_000) }; break;
        case "window.create": {
          const opens = timestamp(data.opens_at, "Opening time");
          const closes = timestamp(data.closes_at, "Closing time");
          if (opens >= closes) error(422, "invalid_window", "Closing time must follow opening time");
          input = { title: text(data.title, "Window title", 200), assessment_version_id: uuid(data.assessment_version_id), opens_at: opens, closes_at: closes }; break;
        }
        case "registration.create": input = { window_id: uuid(data.window_id), candidate_id: uuid(data.candidate_id), extra_seconds: integer(data.extra_seconds ?? 0, "Extra time", 0, 86400) }; break;
        case "registration.accommodate": input={registration_id:uuid(data.registration_id),revision:integer(data.revision,'Accommodation revision',0,1000000),extra_seconds:integer(data.extra_seconds,'Extra time',0,86400),break_policy:breakPolicy(data.break_policy),reason:text(data.reason,'Approval reason (no medical details)',2000)};break;
        case "attempt.start": {
          const prepared=await delivery(tenant,actor!,uuid(data.registration_id));
          if(prepared.requirements.response_tools.length)error(422,'media_delivery_unavailable','This assessment requires response tools that are not connected yet. Contact the institution before starting.');
          if(prepared.requirements.media_response_tools.length&&(!mediaAnswersEnabled||data.media_answer_client!==MEDIA_ANSWER_DELIVERY_PROTOCOL))error(422,'media_answer_delivery_unavailable','This assessment requires enabled academic media answers and the current compatible Exam client.');
          if(prepared.requirements.image_response_tools.length&&(!imageResponsesEnabled||data.image_response_client!==IMAGE_RESPONSE_PROTOCOL))error(422,'image_response_delivery_unavailable','This assessment requires the enabled image-response client. Contact your institution before starting.');
          if(prepared.requirements.prompt_media.length&&(!promptMediaEnabled||data.delivery_client!=='assessment.prompt-media.v1'))error(422,'media_delivery_unavailable','This assessment requires enabled protected-media delivery and a current Schood Exam client. Contact the institution before starting.');
          // Client readiness is a compatibility signal, not trusted-device attestation.
          let manifest:Manifest;
          if(hasBlueprint(prepared.definition)){
            const existing=await repository.list('assessment_attempts',tenant,{registration_id:String(prepared.registration.id),candidate_id:actor!});
            if(existing.length>1)error(503,'blueprint_attempt_conflict','The canonical attempt could not be uniquely confirmed.');
            if(existing.length){const form=await repository.get('assessment_forms',tenant,String(existing[0].form_id));if(!form)error(503,'blueprint_form_unavailable','The committed form is unavailable. Contact your institution; no new form was generated.');manifest=object(form!.manifest) as unknown as Manifest;}
            else{
              // Questions already at their sitting exposure limit are not offered; the
              // database re-checks under a per-sitting lock at admission.
              const limited=prepared.definition.sections.some(section=>section.blueprint?.exposure);
              const unavailable=limited&&repository.saturated?new Set((await repository.saturated(tenant,actor!,String(prepared.registration.id))).map(id=>id.toLowerCase())):new Set<string>();
              manifest=buildManifest(String(prepared.version.id),prepared.definition,prepared.items,undefined,unavailable);
            }
          }else manifest=buildManifest(String(prepared.version.id), prepared.definition, prepared.items);
          input = { registration_id: prepared.registration.id, manifest, manifest_hash: await hash(manifest) };
          if(data.capture_binding!==undefined){
            if(!captureLaunchEnabled)error(503,'capture_launch_unavailable','Required recording launch is not enabled. Contact your institution.');
            const binding=object(data.capture_binding);input.capture_binding={session_id:uuid(binding.session_id),...captureBinding(binding)};
          }
          break;
        }
        case "response.append": {
          const response = data.response as unknown;
          if (response === undefined || new TextEncoder().encode(JSON.stringify(response)).length > 100000) error(422, "invalid_response", "Response exceeds 100 KB or is missing");
          input = { attempt_id: uuid(data.attempt_id), sequence: integer(data.sequence, "Sequence", 1, 1_000_000), item_version_id: uuid(data.item_version_id), response };
          input.payload_hash = await hash({ item_version_id: input.item_version_id, response }); break;
        }
        case "attempt.submit": case "section.advance": input = { attempt_id: uuid(data.attempt_id) }; break;
        default: error(422, "unknown_action", "Unknown assessment action");
      }
      if (tablesForItemAction[action]) {
        const id = String(input!.id ?? input!.item_id);
        if (!await repository.get(tablesForItemAction[action], tenant, id)) error(404, "not_found", "Record not found");
      }
      if(['assessment.create','assessment.revise','assessment.publish'].includes(action)){
        let definition:Definition;if(action==='assessment.publish'){
          const current=await repository.get('assessment_definitions',tenant,String(input!.id));if(!current)error(404,'not_found','Assessment not found');
          // A lost publication receipt may be retried after another manager
          // edits the working definition. Rebuild only its pinned revision.
          if(typeof current!.revision==='number'&&current!.revision!==input!.revision){const history=await repository.list('assessment_definition_revisions',tenant,{assessment_id:String(input!.id),revision:String(input!.revision)});if(history.length!==1)error(409,'revision_conflict','The reviewed working revision is not available. Refresh the institution history.');definition=validateDefinition(history[0].definition);}else definition=validateDefinition(current!.definition);
        }else definition=input!.definition as Definition;
        if(hasBlueprint(definition))input!.blueprint_witness=(await blueprintExample(repository,tenant,definition)).witness;
      }
      const result = await repository.command(actor!, tenant, key, action, input!);
      return json(200, { data: result, request_id: requestId });
    } catch (cause) {
      if (cause instanceof ContractError) return json(cause.status, { code: cause.code, error: cause.message, request_id: requestId });
      console.error("assessment-cloud request failed", { request_id: requestId, error: cause instanceof Error ? cause.message : "Unknown failure" });
      return json(500, { code: "internal_error", error: "The assessment service could not complete this request", request_id: requestId });
    }
  };
}
