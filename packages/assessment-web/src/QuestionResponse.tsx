import React from 'react';
import type {FormItem} from '../../assessment-core/src/mod.ts';
import {moveOrder} from '../../assessment-core/src/authoring.ts';
import {ImageQuestionResponse,type QuestionMediaContext} from './ImageQuestionResponse';
import {MediaAnswerRules} from './MediaAnswerRules';
/** Public question content only. Used by delivery and author preview; never accepts an answer key. */
export function QuestionResponse({entry,value,onChange,mediaContext,academicResponse}:{entry:FormItem;value:unknown;onChange:(value:unknown)=>void;mediaContext?:QuestionMediaContext;academicResponse?:React.ReactNode}){
 const item=entry.item,options=item.options??[];
 if(['single_choice','true_false'].includes(item.type))return <fieldset><legend>Choose one answer</legend>{options.map(option=><label className="check" key={option.id}><input type="radio" name={entry.item_version_id} checked={value===option.id} onChange={()=>onChange(option.id)}/>{option.text}</label>)}</fieldset>;
 if(item.type==='multi_choice')return <fieldset><legend>Choose all applicable answers</legend>{options.map(option=><label className="check" key={option.id}><input type="checkbox" checked={Array.isArray(value)&&value.includes(option.id)} onChange={event=>{const current=Array.isArray(value)?value:[];onChange(event.target.checked?[...current,option.id]:current.filter(id=>id!==option.id));}}/>{option.text}</label>)}</fieldset>;
 if(item.type==='ordering'){
  const actual=Array.isArray(value)&&value.length===options.length&&new Set(value).size===options.length&&value.every(id=>options.some(row=>row.id===id))?value as string[]:options.map(row=>row.id);
  return <fieldset><legend>Put the answers in order</legend><ol className="answer-order">{actual.map((id,index)=><li key={id}><span>{options.find(row=>row.id===id)?.text}</span><div><button type="button" className="quiet" disabled={index===0} aria-label={`Move answer ${index+1} up`} onClick={()=>onChange(moveOrder(actual,index,-1))}>Move up</button><button type="button" className="quiet" disabled={index===actual.length-1} aria-label={`Move answer ${index+1} down`} onClick={()=>onChange(moveOrder(actual,index,1))}>Move down</button></div></li>)}</ol><button type="button" className="quiet" onClick={()=>onChange(actual)}>Use this order</button></fieldset>;
 }
 if(['hotspot','diagram_labeling'].includes(item.type))return <ImageQuestionResponse item={item} value={value} onChange={onChange} context={mediaContext}/>;
 if(['audio_response','video_response','file_response'].includes(item.type))return academicResponse??<><MediaAnswerRules policy={item.media_response}/>{mediaContext?.attempt?<p role="alert">This exam requires a submission tool that is not enabled. Contact your institution before continuing.</p>:<p className="hint">Read-only question preview. Candidate recording and upload controls are not enabled in this preview.</p>}</>;
 if(item.response_ids)return <fieldset><legend>Complete each response</legend>{item.response_ids.map(id=><label key={id}>{id}{item.type==='matching'?<select value={String((value as Record<string,unknown>)?.[id]??'')} onChange={event=>onChange({...((value??{}) as object),[id]:event.target.value})}><option value="">Choose an answer</option>{options.map(option=><option key={option.id} value={option.id}>{option.text}</option>)}</select>:<input value={String((value as Record<string,unknown>)?.[id]??'')} onChange={event=>onChange({...((value??{}) as object),[id]:event.target.value})}/>}</label>)}</fieldset>;
 if(item.type==='numeric')return <label>Your numeric answer<input type="text" inputMode="decimal" value={typeof value==='string'?value:''} onChange={event=>onChange(event.target.value)}/></label>;
 return <label>Your response<textarea rows={item.type==='essay'?12:3} value={typeof value==='string'?value:''} onChange={event=>onChange(event.target.value)}/></label>;
}
