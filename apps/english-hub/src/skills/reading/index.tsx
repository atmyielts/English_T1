import { Route, Routes } from 'react-router-dom';
import { SkillHome } from '../SkillHome';

// Placeholder until the reading activity player lands.
const App = () => (
  <Routes>
    <Route index element={<SkillHome skill="reading" />} />
    <Route path="*" element={<SkillHome skill="reading" />} />
  </Routes>
);

export default App;
