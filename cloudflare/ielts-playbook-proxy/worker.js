const PLAYBOOK_ORIGIN = 'https://schood-ielts-playbook.pages.dev';

export default {
  async fetch(request) {
    const incomingUrl = new URL(request.url);
    const targetUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, PLAYBOOK_ORIGIN);

    // Keep the original method, headers, and body while swapping the upstream host.
    return fetch(new Request(targetUrl.toString(), request));
  },
};
