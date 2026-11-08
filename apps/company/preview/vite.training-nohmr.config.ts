// Temporary: preview without live reload while other builders edit this worktree.
import { mergeConfig } from 'vite';
import base from './vite.preview.config.ts';
export default mergeConfig(base, { server: { hmr: false, watch: null } });
