const STALE_CHUNK_MODULE = `
const refreshUrl = new URL(window.location.href);
refreshUrl.searchParams.set("refresh", Date.now().toString());
window.location.replace(refreshUrl.toString());

export default function StaleChunkReload() {
  return null;
}
`;

export default {
  fetch() {
    return new Response(STALE_CHUNK_MODULE, {
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "no-store, no-cache, must-revalidate",
        "x-content-type-options": "nosniff",
      },
    });
  },
};
