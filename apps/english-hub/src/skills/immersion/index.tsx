import { Route, Routes } from 'react-router-dom';
import { SkillHome } from '../SkillHome';

// Placeholder until the immersion activity player lands.
const App = () => (
  <Routes>
    <Route index element={<SkillHome skill="immersion" />} />
    <Route path="*" element={<SkillHome skill="immersion" />} />
  </Routes>
);

export default App;
