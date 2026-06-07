const MODULE_BY_HOST = {
  'reading.english.schood.online': 'reading',
  'writing.english.schood.online': 'writing',
  'listening.english.schood.online': 'listening',
  'speaking.english.schood.online': 'speaking',
  'grammar.english.schood.online': 'grammar',
  'vocabulary.english.schood.online': 'vocabulary',
  'immersion.english.schood.online': 'immersion',
};

export default {
  fetch(request) {
    const source = new URL(request.url);
    const module = MODULE_BY_HOST[source.hostname.toLowerCase()];

    if (!module) {
      return new Response('Unknown English module host.', { status: 404 });
    }

    const target = new URL(request.url);
    target.protocol = 'https';
    target.hostname = 'english.schood.online';
    target.pathname = `/${module}${source.pathname === '/' ? '' : source.pathname}`;

    return Response.redirect(target.toString(), 301);
  },
};
