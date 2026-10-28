import { PlaybookApp } from '../../../packages/exam-playbook-web/src/App';
import { SAT_CONFIG } from '../../../packages/exam-playbook-web/src/config';

// App root (kept as src/App.tsx so the shared UI-recovery checks can replace it).
export default function App() {
  return <PlaybookApp config={SAT_CONFIG} />;
}
