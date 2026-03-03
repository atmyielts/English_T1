export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const target = new URL(`https://schood.online${incoming.pathname}${incoming.search}`);
    return Response.redirect(target.toString(), 301);
  },
};
