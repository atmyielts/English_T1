import {assertEquals,assertThrows} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {parseImportCsv,importRowsFromMatrix,mapStudentHeaders,mappedImportCell,normalizeImportHeading} from '../apps/academy/src/lib/importFile.ts';
Deno.test('student CSV handles UTF8 BOM, quoted newlines, escaped quotes and localized delimiters without changing columns',()=>{
  assertEquals(parseImportCsv('\uFEFFИмя;Телефон;Баланс\r\n"Азиз; Алиев";+998901234567;800000'),[['Имя','Телефон','Баланс'],['Азиз; Алиев','+998901234567','800000']]);
  assertEquals(parseImportCsv('Name,Phone\n"Aziz ""A""\nAliyev",+998901234567'),[['Name','Phone'],['Aziz "A"\nAliyev','+998901234567']]);
  assertEquals(parseImportCsv('Name\tPhone\nAziz\t+998901234567'),[['Name','Phone'],['Aziz','+998901234567']]);
});
Deno.test('malformed CSV and surplus columns cannot silently change a student identity or balance',()=>{
  for(const csv of ['Name,Phone\nA"ziz",123','Name,Phone\n"Aziz"x,123','Name,Phone\n"Aziz,123'])assertThrows(()=>parseImportCsv(csv),Error,'CSV');
  assertThrows(()=>importRowsFromMatrix(parseImportCsv('Name,Phone\nAziz,123,999')),Error,'more values');
  assertThrows(()=>importRowsFromMatrix([['Name'],[null]]),Error,'at least one');
});
Deno.test('Russian and Uzbek headings remain distinct and ambiguous auto-matches require explicit mapping',()=>{
  const parsed=importRowsFromMatrix([['ФИО','Телефон','Телефон родителя','Группа','Баланс','Дата начала'],['Азиз Алиев','901234567','909876543','IELTS A',800000,'2026-10-01']]);
  assertEquals(mapStudentHeaders(parsed.headers),{full_name:'ФИО',first_name:'',last_name:'',phone:'Телефон',parent_phone:'Телефон родителя',group_name:'Группа',balance:'Баланс',joined_on:'Дата начала'});
  assertEquals(normalizeImportHeading('O‘quvchi ismi'),'o_quvchi_ismi');
  assertEquals(mapStudentHeaders(['Phone','Telefon']).phone,'');
  assertThrows(()=>importRowsFromMatrix([['Телефон','телефон'],['1','2']]),Error,'unique');
});
Deno.test('Excel dates retain their calendar day and imported inactive staff do not become active',()=>{
  assertEquals(mappedImportCell(new Date('2026-10-01T00:00Z'),'joined_on'),'2026-10-01');
  assertEquals(mappedImportCell('false','is_active'),false);assertEquals(mappedImportCell('нет','is_active'),false);assertEquals(mappedImportCell('ha','is_active'),true);
  assertThrows(()=>mappedImportCell('perhaps','is_active'),Error,'yes or no');
  const dangerous=importRowsFromMatrix([['__proto__','constructor','Phone'],['safe','safe','123']]).rows[0];
  assertEquals(Object.getPrototypeOf(dangerous),Object.prototype);assertEquals(Object.hasOwn(dangerous,'__proto__'),true);assertEquals<unknown>(dangerous.constructor,'safe');
});
