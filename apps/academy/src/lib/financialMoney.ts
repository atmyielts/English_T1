import {getLocaleTag} from '../i18n';

export function exactUnits(value:unknown):bigint{
 if(value==null||value==='')return 0n;
 if(typeof value==='bigint')return value;
 if(typeof value==='number'&&!Number.isSafeInteger(value))throw new Error('An exact whole amount is required.');
 if(!/^[+-]?\d+$/.test(String(value)))throw new Error('An exact whole amount is required.');
 return BigInt(String(value));
}
export function financialMoney(value:unknown,currency='UZS'){
 try{return `${new Intl.NumberFormat(getLocaleTag()).format(exactUnits(value))} ${currency}`;}catch{return '—';}
}
export function financialTotals(rows:Array<{currency:string;[key:string]:unknown}>|undefined,field:string){
 return rows?.length?rows.map(row=>financialMoney(row[field],row.currency)).join(' · '):'—';
}
export function sumCurrencies(rows:Array<{currency:string;[key:string]:unknown}>,field:string){
 const totals=new Map<string,bigint>();for(const row of rows)totals.set(row.currency,(totals.get(row.currency)??0n)+exactUnits(row[field]));
 return [...totals].map(([currency,amount])=>({currency,amount}));
}
