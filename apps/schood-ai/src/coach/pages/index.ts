// Every coach page, in one chunk loaded on the first visit to /coach (routes.tsx):
// one request for the Mini App, and nothing in the main bundle.
export { CoachHome } from './Home.tsx';
export { CoachDashboard } from './Dashboard.tsx';
export { CoachReport } from './Report.tsx';
export { CoachPlan } from './Plan.tsx';
export { CoachSettingsPage } from './Settings.tsx';
export { CoachSession } from './Session.tsx';
export { CoachSamples } from './Samples.tsx';
export { CoachLink } from './Link.tsx';
export { CoachCertificates, CoachTeam, CoachVerify } from './Records.tsx';
export { CoachChart, CoachListen, CoachShadow, CoachTimer } from './Tools.tsx';
export { CoachMistakes } from './Mistakes.tsx';
export { CoachScripts } from './Scripts.tsx';
