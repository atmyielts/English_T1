import {defineConfig} from 'vite';
import {schoodDesignAssets} from '../../packages/service-design/build-assets';
import {companyPublicAssets} from './site-assets-plugin';
export default defineConfig({plugins:[schoodDesignAssets(),companyPublicAssets()]});
