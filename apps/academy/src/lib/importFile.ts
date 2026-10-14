export type ImportCell=string|number|boolean|Date|null;
export type ImportRow=Record<string,ImportCell>;
export const normalizeImportHeading=(value:string)=>value.normalize('NFKC').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'_').replace(/^_+|_+$/g,'');
export function normalizeImportCell(value:unknown):ImportCell{
  if(value==null)return null;
  if(typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number'&&Number.isFinite(value))return value;
  if(value instanceof Date&&Number.isFinite(value.getTime()))return value;
  throw new Error('The file contains an unsupported cell value.');
}
const text=(value:ImportCell)=>value==null?'':value instanceof Date?value.toISOString().slice(0,10):String(value);
export function importRowsFromMatrix(matrix:ImportCell[][]){
  if(matrix.length<2)throw new Error('The file needs a header and at least one data row.');
  if(matrix.length>5001)throw new Error('Import files are limited to 5,000 rows per job.');
  const headers=matrix[0].map(value=>text(value).replace(/^\uFEFF/,'').trim());
  if(headers.some(header=>!header))throw new Error('Every source column needs a header.');
  const normalized=headers.map(normalizeImportHeading);
  if(normalized.some(header=>!header)||new Set(normalized).size!==headers.length)throw new Error('Source headers must be unique.');
  const rows:ImportRow[]=[];
  for(const row of matrix.slice(1)){
    if(!row.some(value=>text(value).trim()))continue;
    if(row.length>headers.length&&row.slice(headers.length).some(value=>text(value).trim()))throw new Error('A source row has more values than the header.');
    rows.push(Object.fromEntries(headers.map((header,index)=>[header,normalizeImportCell(row[index]??null)])));
  }
  if(!rows.length)throw new Error('The file needs a header and at least one data row.');
  return {headers,rows};
}
function delimiterFor(source:string){
  const counts=new Map([[',',0],[';',0],['\t',0]]);let quoted=false;
  for(let i=0;i<source.length;i++){
    const c=source[i];
    if(c==='"'){if(quoted&&source[i+1]==='"')i++;else quoted=!quoted;}
    else if(!quoted&&(c==='\n'||c==='\r'))break;
    else if(!quoted&&counts.has(c))counts.set(c,counts.get(c)!+1);
  }
  return [...counts].sort((a,b)=>b[1]-a[1])[0][0];
}
export function parseImportCsv(input:string):ImportCell[][]{
  if(new TextEncoder().encode(input).length>10*1024*1024)throw new Error('Import files are limited to 10 MB.');
  const source=input.replace(/^\uFEFF/,''),delimiter=delimiterFor(source),rows:ImportCell[][]=[];
  let row:string[]=[],cell='',state:'plain'|'quoted'|'closed'='plain';
  const finishCell=()=>{row.push(cell.trim());cell='';state='plain';};
  const finishRow=()=>{finishCell();if(row.some(value=>value!==''))rows.push(row);row=[];if(rows.length>5001)throw new Error('Import files are limited to 5,000 rows per job.');};
  for(let i=0;i<source.length;i++){
    const c=source[i];
    if(state==='quoted'){
      if(c==='"'){if(source[i+1]==='"'){cell+='"';i++;}else state='closed';}else cell+=c;
      continue;
    }
    if(c===delimiter){finishCell();continue;}
    if(c==='\n'||c==='\r'){if(c==='\r'&&source[i+1]==='\n')i++;finishRow();continue;}
    if(state==='closed'){if(c===' '||c==='\t')continue;throw new Error('CSV contains text after a closing quote.');}
    if(c==='"'){if(cell.trim())throw new Error('CSV quotes must enclose an entire field.');cell='';state='quoted';}
    else cell+=c;
  }
  if(state==='quoted')throw new Error('CSV contains an unclosed quoted field.');
  finishRow();return rows;
}
export function mappedImportCell(value:ImportCell,key:string):ImportCell{
  if(value instanceof Date){
    if(['joined_on','join_date','session_date','effective_on'].includes(key))return value.toISOString().slice(0,10);
    return value.toISOString();
  }
  if(key==='is_active'&&typeof value==='string'&&value.trim()){
    const normalized=normalizeImportHeading(value);
    if(['true','yes','ha','да','1','on'].includes(normalized))return true;
    if(['false','no','yo_q','нет','0','off'].includes(normalized))return false;
    throw new Error('Map active status to yes or no.');
  }
  return value;
}
const studentAliases:Record<string,string[]>={
  full_name:['name','full name','student name','fio','фио','имя ученика','ism familiya','oquvchi ismi','o‘quvchi ismi'],
  first_name:['first name','ism','имя'],last_name:['last name','surname','familiya','фамилия'],
  phone:['phone','student phone','telefon','telefon raqami','телефон','номер телефона'],
  parent_phone:['parent phone','guardian phone','ota ona telefoni','ota-ona telefoni','телефон родителя'],
  group_name:['group','group name','class','guruh','группа'],
  balance:['balance','wallet','deposit','balans','остаток','баланс'],
  joined_on:['join date','joined on','start date','qo‘shilgan sana','qoshilgan sana','дата поступления','дата начала'],
};
export function mapStudentHeaders(headers:string[]){
  const normalized=headers.map(header=>normalizeImportHeading(header));
  return Object.fromEntries(Object.entries(studentAliases).map(([key,aliases])=>{
    const accepted=new Set([key,...aliases].map(normalizeImportHeading));
    const matches=headers.filter((_,index)=>accepted.has(normalized[index]));
    return [key,matches.length===1?matches[0]:''];
  }));
}
