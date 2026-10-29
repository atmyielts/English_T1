// Public site: landing page and demo requests. Owned by the "gtm" workstream.
import React from 'react';
import type { AreaRoute } from '../types.ts';
import { Landing } from './Landing.tsx';
import '../people/people.css';
import './site.css';

export const routes: AreaRoute[] = [
  { path: '/', access: 'public', bare: true, render: () => <Landing/> },
];
