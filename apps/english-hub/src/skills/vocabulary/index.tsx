import { Route, Routes } from 'react-router-dom';
import { SkillHome } from '../SkillHome';

// Placeholder until the vocabulary activity player lands.
const App = () => (
  <Routes>
    <Route index element={<SkillHome skill="vocabulary" />} />
    <Route path="*" element={<SkillHome skill="vocabulary" />} />
  </Routes>
);

export default App;
