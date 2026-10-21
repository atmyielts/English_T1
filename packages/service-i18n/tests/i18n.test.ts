import {format,normalizeLocale,type Catalogs} from '../src/format.ts';
const equal=(a:unknown,b:unknown)=>{if(a!==b)throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);};
const catalogs:Catalogs<'left'|'hello'|'onlyEn'>={
 en:{left:'{count|one:# break left|other:# breaks left}',hello:'Hello, {name}',onlyEn:'English only'},
 uz:{left:'{count|other:# ta tanaffus qoldi}',hello:'Salom, {name}',onlyEn:''},
 ru:{left:'{count|one:Остался # перерыв|few:Осталось # перерыва|many:Осталось # перерывов|other:Осталось # перерыва}',hello:'Здравствуйте, {name}',onlyEn:'Только английский'},
};
Deno.test('locale codes normalise from browser and URL forms',()=>{
 equal(normalizeLocale('ru-RU'),'ru');equal(normalizeLocale('UZ'),'uz');equal(normalizeLocale('uz_Latn'),'uz');equal(normalizeLocale('de'),null);equal(normalizeLocale(null),null);
});
Deno.test('placeholders fill and plural forms follow each language’s rules',()=>{
 equal(format(catalogs,'en','left',{count:1}),'1 break left');equal(format(catalogs,'en','left',{count:3}),'3 breaks left');
 equal(format(catalogs,'ru','left',{count:1}),'Остался 1 перерыв');equal(format(catalogs,'ru','left',{count:3}),'Осталось 3 перерыва');equal(format(catalogs,'ru','left',{count:5}),'Осталось 5 перерывов');
 equal(format(catalogs,'uz','left',{count:2}),'2 ta tanaffus qoldi');equal(format(catalogs,'uz','hello',{name:'Dilshod'}),'Salom, Dilshod');
});
Deno.test('an empty or missing translation falls back to English, never to blank text',()=>{
 equal(format(catalogs,'uz','onlyEn'),'English only');equal(format(catalogs,'en','absent'),'absent');equal(format(catalogs,'en','hello'),'Hello, {name}');
});
