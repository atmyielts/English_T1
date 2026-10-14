import {mappedImportCell,type ImportRow} from './importFile';
import type {StudentImportConfig} from './studentImport';

export type StudentImportIntent = {
 version:1;uploadKey:string;commitKey:string;recoveryKey:string;fileHash:string;
 settings:StudentImportConfig;jobId?:string;recoveryReason?:string;
};
export function studentImportBatch(rows:ImportRow[],settings:StudentImportConfig,offset:number,maxRows=200){
 const batch:Record<string,string|number|boolean|null>[]=[];
 for(const row of rows.slice(offset,offset+maxRows)){
  const source:Record<string,string|number|boolean|null>=Object.create(null);
  for(const [field,heading] of Object.entries(settings.column_mapping)){
   const value=mappedImportCell(row[heading]??null,field);
   source[heading]=value instanceof Date?value.toISOString():value;
  }
  if(new TextEncoder().encode(JSON.stringify([...batch,source])).length>1500000){
   if(!batch.length)throw new Error('A source row is too large to upload.');
   break;
  }
  batch.push(source);
 }
 return batch;
}
export const exactImportAmount=(value:string|null|undefined)=>value==null?'—':BigInt(value).toLocaleString();
export function readStudentImportIntent(storage:Pick<Storage,'getItem'>,key:string):StudentImportIntent|null{
 try{
  const value=JSON.parse(storage.getItem(key)??'null');
  if(value?.version!==1||typeof value.uploadKey!=='string'||typeof value.commitKey!=='string'||typeof value.recoveryKey!=='string'
   ||typeof value.fileHash!=='string'||!value.settings||typeof value.settings.branch_id!=='string')return null;
  return value;
 }catch{return null;}
}
