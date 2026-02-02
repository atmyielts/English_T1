import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TestOverview } from './pages/TestOverview';
import { Dashboard } from './pages/Dashboard';
import { TestCompleted } from './pages/TestCompleted';
import { ExamPlayer } from './pages/ExamPlayer';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/test/:testId" element={<TestOverview />} />
        <Route path="/exam/:testId/:sectionId" element={<ExamPlayer />} />
        <Route path="/test-completed" element={<TestCompleted />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
