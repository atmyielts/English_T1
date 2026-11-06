import React from 'react';
import type { AreaRoute } from '../types.ts';
import { CreateWorkspace, Picker } from './pages.tsx';

export const routes: AreaRoute[] = [
  { path: '/w', access: 'user', render: () => <Picker/> },
  { path: '/start', access: 'user', render: () => <CreateWorkspace/> },
];
