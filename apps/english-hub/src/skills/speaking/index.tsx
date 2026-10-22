import { Route, Routes } from 'react-router-dom';
import { SkillHome } from '../SkillHome';

// Placeholder until the speaking activity player lands.
const App = () => (
  <Routes>
    <Route index element={<SkillHome skill="speaking" />} />
    <Route path="*" element={<SkillHome skill="speaking" />} />
  </Routes>
);

export default App;
