export const IELTS_PLAYBOOK_PRODUCT_ID = '9de6c9e7-31df-4d1d-9574-1f8f84a53b54';
export const IELTS_PLAYBOOK_PRODUCT_SLUG = 'ielts-playbook';
export const PLAYBOOK_APP_URL =
  String(import.meta.env.VITE_PLAYBOOK_APP_URL ?? 'https://playbook.ielts.schood.online').replace(/\/$/, '');
export const SIMULATOR_APP_URL =
  String(import.meta.env.VITE_IELTS_SIMULATOR_URL ?? 'https://ielts.schood.online').replace(/\/$/, '');
export const PRACTICE_APP_URL =
  String(import.meta.env.VITE_IELTS_PRACTICE_URL ?? 'https://practice.ielts.schood.online').replace(/\/$/, '');

