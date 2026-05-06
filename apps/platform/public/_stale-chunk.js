const refreshUrl = new URL(window.location.href);
refreshUrl.searchParams.set("refresh", Date.now().toString());
window.location.replace(refreshUrl.toString());

export default function StaleChunkReload() {
  return null;
}
