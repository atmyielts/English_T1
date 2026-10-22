import { Route, Routes } from 'react-router-dom';
import { SkillHome } from '../SkillHome';

// Placeholder until the listening activity player lands.
const App = () => (
  <Routes>
    <Route index element={<SkillHome skill="listening" />} />
    <Route path="*" element={<SkillHome skill="listening" />} />
  </Routes>
);

export default App;
