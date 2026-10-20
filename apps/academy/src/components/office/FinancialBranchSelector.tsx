import {translate} from '../../i18n';
export type FinancialBranch={id:string;name:string};
export function FinancialBranchSelector({branches,value,disabled,onChange}:{branches:FinancialBranch[];value:string;disabled:boolean;onChange:(id:string)=>void}){
 return <label className="form-field">{translate('Financial branch')}<select className="input" value={value} disabled={disabled} onChange={event=>onChange(event.target.value)}>
  <option value="">{translate('All permitted branches')}</option>{branches.map(branch=><option key={branch.id} value={branch.id}>{branch.name}</option>)}
 </select></label>;
}
