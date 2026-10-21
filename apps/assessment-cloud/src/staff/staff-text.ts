import {staffLabels,type StaffCapability} from '../../../../packages/assessment-core/src/staff';
import {useAppT,useCodeText,type AppKey} from '../i18n/index.ts';

const presets:Record<string,AppKey>={
  Author:'staff.preset.author',
  Reviewer:'staff.preset.reviewer',
  Publisher:'staff.preset.publisher',
  'Exam coordinator':'staff.preset.examCoordinator',
  Marker:'staff.preset.marker',
  Moderator:'staff.preset.moderator',
  'Results publisher':'staff.preset.resultsPublisher',
  Auditor:'staff.preset.auditor',
  'Staff manager':'staff.preset.staffManager',
  'Certificate manager':'staff.preset.certificateManager',
};
/** Reader-language permission (`staff.cap.<capability>`) and preset names;
 * anything this catalog does not know keeps the shared English label. */
export function useStaffText(){
  const t=useAppT(),codeText=useCodeText();
  return {
    capability:(cap:StaffCapability)=>codeText('staff.cap',cap,staffLabels[cap]),
    preset:(name:string)=>presets[name]?t(presets[name]):name,
  };
}
