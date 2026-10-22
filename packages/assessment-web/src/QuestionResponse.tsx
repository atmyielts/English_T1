import React from 'react';
import type {FormItem} from '../../assessment-core/src/mod.ts';
import {moveOrder} from '../../assessment-core/src/authoring.ts';
import {ImageQuestionResponse,type QuestionMediaContext} from './ImageQuestionResponse';
import {MediaAnswerRules} from './MediaAnswerRules';
import {useWebT} from './i18n/useWebT.ts';
import {MathText} from './MathText';
/** Public question content only. Used by delivery and author preview; never accepts an answer key. */
export function QuestionResponse({entry,value,onChange,mediaContext,academicResponse}:{entry:FormItem;value:unknown;onChange:(value:unknown)=>void;mediaContext?:QuestionMediaContext;academicResponse?:React.ReactNode}){
 const t=useWebT(),item=entry.item,options=item.options??[];
 if(['single_choice','true_false'].includes(item.type))return <fieldset><legend>{t('question.chooseOne')}</legend>{options.map(option=><label className="check" key={option.id}><input type="radio" name={entry.item_version_id} checked={value===option.id} onChange={()=>onChange(option.id)}/><MathText text={option.text}/></label>)}</fieldset>;
 if(item.type==='multi_choice')return <fieldset><legend>{t('question.chooseAll')}</legend>{options.map(option=><label className="check" key={option.id}><input type="checkbox" checked={Array.isArray(value)&&value.includes(option.id)} onChange={event=>{const current=Array.isArray(value)?value:[];onChange(event.target.checked?[...current,option.id]:current.filter(id=>id!==option.id));}}/><MathText text={option.text}/></label>)}</fieldset>;
 if(item.type==='ordering'){
  const actual=Array.isArray(value)&&value.length===options.length&&new Set(value).size===options.length&&value.every(id=>options.some(row=>row.id===id))?value as string[]:options.map(row=>row.id);
  return <fieldset><legend>{t('question.order')}</legend><ol className="answer-order">{actual.map((id,index)=><li key={id}><span><MathText text={options.find(row=>row.id===id)?.text??''}/></span><div><button type="button" className="quiet" disabled={index===0} aria-label={t('question.moveUpLabel',{position:index+1})} onClick={()=>onChange(moveOrder(actual,index,-1))}>{t('question.moveUp')}</button><button type="button" className="quiet" disabled={index===actual.length-1} aria-label={t('question.moveDownLabel',{position:index+1})} onClick={()=>onChange(moveOrder(actual,index,1))}>{t('question.moveDown')}</button></div></li>)}</ol><button type="button" className="quiet" onClick={()=>onChange(actual)}>{t('question.useOrder')}</button></fieldset>;
 }
 if(['hotspot','diagram_labeling'].includes(item.type))return <ImageQuestionResponse item={item} value={value} onChange={onChange} context={mediaContext}/>;
 if(['audio_response','video_response','file_response'].includes(item.type))return academicResponse??<><MediaAnswerRules policy={item.media_response}/>{mediaContext?.attempt?<p role="alert">{t('question.toolDisabled')}</p>:<p className="hint">{t('question.previewOnly')}</p>}</>;
 if(item.response_ids)return <fieldset><legend>{t('question.completeEach')}</legend>{item.response_ids.map(id=><label key={id}>{id}{item.type==='matching'?<select value={String((value as Record<string,unknown>)?.[id]??'')} onChange={event=>onChange({...((value??{}) as object),[id]:event.target.value})}><option value="">{t('question.chooseAnswer')}</option>{options.map(option=><option key={option.id} value={option.id}>{option.text}</option>)}</select>:<input value={String((value as Record<string,unknown>)?.[id]??'')} onChange={event=>onChange({...((value??{}) as object),[id]:event.target.value})}/>}</label>)}</fieldset>;
 if(item.type==='numeric')return <label>{t('question.numeric')}<input type="text" inputMode="decimal" value={typeof value==='string'?value:''} onChange={event=>onChange(event.target.value)}/></label>;
 return <label>{t('question.response')}<textarea rows={item.type==='essay'?12:3} value={typeof value==='string'?value:''} onChange={event=>onChange(event.target.value)}/></label>;
}
