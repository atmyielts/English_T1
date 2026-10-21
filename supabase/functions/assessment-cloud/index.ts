import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { createHandler } from "./handler.ts";
import {createAssessmentRepository,type AssessmentDatabase} from './repository.ts';
import {createGradingHandler} from './grading-handler.ts';
import {createGradingRepository} from './grading-repository.ts';
import {createStaffHandler} from './staff-handler.ts';
import {createStaffRepository} from './staff-repository.ts';
import {createArtifactHandler} from './artifact-handler.ts';
import {createArtifactRepository} from './artifact-repository.ts';
import {createAppealHandler} from './appeal-handler.ts';
import {createAppealRepository} from './appeal-repository.ts';
import {createCertificateHandler} from './certificate-handler.ts';
import {createCertificateRepository} from './certificate-repository.ts';
import {CertificateSigner} from './certificate-signer.ts';
import {createCertificateDocumentHandler} from './certificate-document-handler.ts';
import {createCertificateDocumentRepository} from './certificate-document-repository.ts';
import {createCertificateDocumentTransport,type CertificateDocumentRenderer} from './certificate-document-transport.ts';
import {certificateVerificationUrl,CERTIFICATE_REFERENCE_FORMAT} from '../../../packages/assessment-core/src/certificate-document.ts';
import {createCohortHandler} from './cohort-handler.ts';
import {createCohortRepository} from './cohort-repository.ts';
import {createImportHandler} from './import-handler.ts';
import {createImportRepository} from './import-repository.ts';
import {createAnalyticsHandler} from './analytics-handler.ts';
import {createAnalyticsRepository} from './analytics-repository.ts';
import {createFeedbackHandler} from './feedback-handler.ts';
import {createFeedbackRepository} from './feedback-repository.ts';
import {createMediaAnswerHandler} from './media-answer-handler.ts';
import {createMediaAnswerRepository} from './media-answer-repository.ts';
import {createQtiHandler} from './qti-handler.ts';
import {createQtiRepository} from './qti-repository.ts';
import {createInvitationHandler} from './invitation-handler.ts';
import {createInvitationRepository} from './invitation-repository.ts';
import {InvitationSigner} from './invitation-signer.ts';
import {createInvitationMailHandler} from './invitation-mail-handler.ts';
import {createInvitationMailRepository} from './invitation-mail-repository.ts';
import {createBillingHandler} from './billing-handler.ts';
import {createBillingRepository} from './billing-repository.ts';
import {createWebhookHandler} from './webhook-handler.ts';
import {createWebhookRepository} from './webhook-repository.ts';
import {WebhookSecretBox} from './webhook-secrets.ts';

const required = (name: string) => { const value = Deno.env.get(name); if (!value) throw new Error(`Missing ${name}`); return value; };
const auth = createClient(required("SUPABASE_URL"), required("SUPABASE_ANON_KEY"), { auth: { persistSession: false } });
const service = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
// Normalize the untyped PostgREST client at this narrow port; avoids recursive
// generic inference while keeping the canonical mapping independently checked.
const repository=createAssessmentRepository(auth,service as unknown as AssessmentDatabase,{liveLaunchEnabled:Deno.env.get('ASSESSMENT_LIVE_LAUNCH')==='true'&&Deno.env.get('ASSESSMENT_CAPTURE_LAUNCH')==='true'});
const origins = required("ASSESSMENT_ALLOWED_ORIGINS").split(",").map(value => value.trim()).filter(Boolean);
const assessmentHandler=createHandler({repository,allowedOrigins:origins,promptMediaEnabled:Deno.env.get('ASSESSMENT_PROMPT_MEDIA_DELIVERY')==='true',captureLaunchEnabled:Deno.env.get('ASSESSMENT_CAPTURE_LAUNCH')==='true',imageResponsesEnabled:Deno.env.get('ASSESSMENT_IMAGE_RESPONSES')==='true',mediaAnswersEnabled:Deno.env.get('ASSESSMENT_MEDIA_ANSWERS')==='true'});
const gradingHandler=createGradingHandler(createGradingRepository(auth,service),origins,Deno.env.get('ASSESSMENT_GRADING_SECRET')??'');
const staffHandler=createStaffHandler(createStaffRepository(auth,service),origins);
let invitationSigner:InvitationSigner|null=null;
try{const keys=Deno.env.get('ASSESSMENT_INVITATION_KEYS');if(keys)invitationSigner=await InvitationSigner.create(Deno.env.get('ASSESSMENT_INVITATION_ACTIVE_KEY')??'',JSON.parse(keys));}catch{console.error('Invitation keys are invalid; staff invitations remain unavailable.');}
const invitationHandler=createInvitationHandler(createInvitationRepository(auth,service),origins,{enabled:Deno.env.get('ASSESSMENT_INVITATIONS_ENABLED')==='true',signer:invitationSigner,appUrl:Deno.env.get('ASSESSMENT_APP_URL')??''});
const invitationMailHandler=createInvitationMailHandler(createInvitationMailRepository(createInvitationRepository(auth,service),service),origins,{enabled:Deno.env.get('ASSESSMENT_INVITATIONS_ENABLED')==='true'&&Deno.env.get('ASSESSMENT_INVITATION_MAIL_ENABLED')==='true',signer:invitationSigner,appUrl:Deno.env.get('ASSESSMENT_APP_URL')??'',workerSecret:Deno.env.get('ASSESSMENT_MAIL_WORKER_SECRET')??''});
const appealHandler=createAppealHandler(createAppealRepository(auth,service),origins);
const cohortHandler=createCohortHandler(createCohortRepository(auth,service),origins,Deno.env.get('ASSESSMENT_ROSTER_SECRET')??'');
const importHandler=createImportHandler(createImportRepository(auth,service),origins);
const qtiHandler=createQtiHandler(createQtiRepository(auth,service),origins,{enabled:Deno.env.get('ASSESSMENT_QTI_ENABLED')==='true',transportKey:Deno.env.get('ASSESSMENT_QTI_TRANSPORT_SECRET')??'',scannerKey:Deno.env.get('ASSESSMENT_QTI_SCANNER_SECRET')??'',parserKey:Deno.env.get('ASSESSMENT_QTI_PARSER_SECRET')??'',scannerId:Deno.env.get('ASSESSMENT_QTI_SCANNER_ID')??'',processorId:Deno.env.get('ASSESSMENT_QTI_PROCESSOR_ID')??''});
const analyticsHandler=createAnalyticsHandler(createAnalyticsRepository(auth,service),origins);
const feedbackHandler=createFeedbackHandler(createFeedbackRepository(auth,service),origins);
let certificateSigner:CertificateSigner|null=null;
try{const keys=Deno.env.get('ASSESSMENT_CERTIFICATE_SIGNING_KEYS');if(keys)certificateSigner=await CertificateSigner.create(Deno.env.get('ASSESSMENT_CERTIFICATE_ACTIVE_KEY')??'',JSON.parse(keys));}catch{console.error('Certificate signing configuration is invalid; issuance and verification remain unavailable.');}
const certificateRepository=createCertificateRepository(auth,service);let certificateRenderer:CertificateDocumentRenderer|null=null;
try{if(Deno.env.get('ASSESSMENT_CERTIFICATE_DOCUMENTS')==='true'){certificateVerificationUrl(Deno.env.get('ASSESSMENT_CERTIFICATE_VERIFICATION_URL')??'',{format:CERTIFICATE_REFERENCE_FORMAT,id:'00000000-0000-4000-8000-000000000001',key_id:'configuration',payload_hash:'0'.repeat(64),signature:'A'.repeat(86)});certificateRenderer=createCertificateDocumentTransport(Deno.env.get('ASSESSMENT_DOCUMENT_URL')??'',Deno.env.get('ASSESSMENT_DOCUMENT_SECRET')??'');}}catch{console.error('Certificate PDF configuration is invalid; document delivery remains disabled.');}
const certificateHandler=createCertificateHandler(certificateRepository,origins,{enabled:Deno.env.get('ASSESSMENT_CERTIFICATE_ISSUANCE')==='true',signer:certificateSigner,documentsEnabled:certificateRenderer!==null&&certificateSigner!==null});
const certificateDocumentHandler=createCertificateDocumentHandler(createCertificateDocumentRepository(certificateRepository,service),origins,{enabled:certificateRenderer!==null,signer:certificateSigner,renderer:certificateRenderer,verificationUrl:Deno.env.get('ASSESSMENT_CERTIFICATE_VERIFICATION_URL')??''});
const artifactHandler=createArtifactHandler(createArtifactRepository(auth,service),origins,{transport:Deno.env.get('ASSESSMENT_MEDIA_SECRET')??'',scanner:Deno.env.get('ASSESSMENT_SCANNER_SECRET')??'',scannerId:Deno.env.get('ASSESSMENT_SCANNER_ID')??''});
const billingHandler=createBillingHandler(createBillingRepository(auth,service),origins);
let webhookBox:WebhookSecretBox|null=null;
try{const keys=Deno.env.get('ASSESSMENT_WEBHOOK_KEYS');if(keys)webhookBox=await WebhookSecretBox.create(Deno.env.get('ASSESSMENT_WEBHOOK_ACTIVE_KEY')??'',JSON.parse(keys));}catch{console.error('Webhook keys are invalid; webhooks remain unavailable.');}
const webhookHandler=createWebhookHandler(createWebhookRepository(auth,service),origins,{enabled:Deno.env.get('ASSESSMENT_WEBHOOKS_ENABLED')==='true',box:webhookBox,dispatchSecret:Deno.env.get('ASSESSMENT_WEBHOOK_DISPATCH_SECRET')??''});
const mediaAnswerHandler=createMediaAnswerHandler(createMediaAnswerRepository(auth,service),origins,Deno.env.get('ASSESSMENT_MEDIA_ANSWERS')==='true');
Deno.serve(req=>{const path=new URL(req.url).pathname;return /\/assessment-cloud\/certificates\/(?:reference\/resolve|[^/]+\/pdf)$/.test(path)?certificateDocumentHandler(req):/\/assessment-cloud\/invitations\/mail(?:\/|$)/.test(path)?invitationMailHandler(req):/\/assessment-cloud\/invitations(?:\/|$)/.test(path)?invitationHandler(req):/\/assessment-cloud\/qti(?:\/|$)/.test(path)?qtiHandler(req):/\/assessment-cloud\/billing(?:\/|$)/.test(path)?billingHandler(req):/\/assessment-cloud\/webhooks(?:\/|$)/.test(path)?webhookHandler(req):/\/assessment-cloud\/answers(?:\/|$)/.test(path)?mediaAnswerHandler(req):/\/assessment-cloud\/feedback(?:\/|$)/.test(path)?feedbackHandler(req):/\/assessment-cloud\/analytics(?:\/|$)/.test(path)?analyticsHandler(req):/\/assessment-cloud\/imports(?:\/|$)/.test(path)?importHandler(req):/\/assessment-cloud\/grading(?:\/|$)/.test(path)?gradingHandler(req):/\/assessment-cloud\/cohorts(?:\/|$)/.test(path)?cohortHandler(req):/\/assessment-cloud\/certificates(?:\/|$)/.test(path)?certificateHandler(req):/\/assessment-cloud\/appeals(?:\/|$)/.test(path)?appealHandler(req):/\/assessment-cloud\/staff(?:\/|$)/.test(path)?staffHandler(req):/\/assessment-cloud\/artifacts(?:\/|$)/.test(path)?artifactHandler(req):assessmentHandler(req);});
