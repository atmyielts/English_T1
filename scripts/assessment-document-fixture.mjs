import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
/** Actual private HTTP renderer + production Edge authority. Only identity and
 * PostgREST are the surrounding stack's explicit disposable adapters. */
export async function assessmentDocumentFixture({root,base,modules,repository,database,currentSigner}){
 if(Number(process.versions.node.split('.')[0])!==24)throw Error('Certificate document acceptance requires isolated Node 24.');
 const {createDocumentServer}=await import(pathToFileURL(path.join(root,'services/assessment-documents/src/server.mjs')).href),secret='synthetic-document-'+randomUUID()+randomUUID(),service=createDocumentServer({secret});
 await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+service.server.address().port+'/render';
 try{const canonical=modules.createCertificateDocumentRepository(repository,database);let loseReport=true;const report=canonical.report;canonical.report=async(...args)=>{const result=await report(...args);if(loseReport){loseReport=false;throw new modules.ContractError('fixture_lost_reply','Committed document receipt reply lost.',503);}return result;};
  const handler=modules.createCertificateDocumentHandler(canonical,[base],{enabled:true,get signer(){return currentSigner();},renderer:modules.createCertificateDocumentTransport(url,secret,{allowLocalhost:true}),verificationUrl:base+'/exam/',allowLocalhost:true});return{handler,dispose:()=>service.close()};
 }catch(cause){await service.close();throw cause;}
}
