import { Route, Routes } from 'react-router-dom';
import { SkillHome } from '../SkillHome';

// Placeholder until the writing activity player lands.
const App = () => (
  <Routes>
    <Route index element={<SkillHome skill="writing" />} />
    <Route path="*" element={<SkillHome skill="writing" />} />
  </Routes>
);

export default App;
