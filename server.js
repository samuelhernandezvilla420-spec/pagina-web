const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const port = Number(process.env.PORT) || 4173;
const publicFiles = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/css/index.css': ['css/index.css', 'text/css; charset=utf-8'],
  '/js/app.js': ['js/app.js', 'text/javascript; charset=utf-8'],
  '/img/oelo.jpg': ['img/oelo.jpg', 'image/jpeg'],
  '/img/images.jpg': ['img/images.jpg', 'image/jpeg'],
  '/img/6590868953_69522033c5_b.jpg': ['img/6590868953_69522033c5_b.jpg', 'image/jpeg'],
  '/img/562944.jpg': ['img/562944.jpg', 'image/jpeg'],
  '/img/5260508.jpg': ['img/5260508.jpg', 'image/jpeg'],
};
const leagueIds = new Set([47, 87, 55, 54, 53, 42, 73, 230, 268, 112, 130]);

function respond(response, status, body, contentType = 'application/json; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(body);
}

async function proxyFotMob(response, url) {
  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36',
        'Referer': 'https://www.fotmob.com/',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await upstream.text();
    if (!upstream.ok || !upstream.headers.get('content-type')?.includes('json')) {
      respond(response, 502, JSON.stringify({ error: 'La fuente de fútbol no está disponible.' }));
      return;
    }
    respond(response, 200, body);
  } catch {
    respond(response, 502, JSON.stringify({ error: 'No se pudo conectar con FotMob.' }));
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method !== 'GET') {
    respond(response, 405, JSON.stringify({ error: 'Método no permitido.' }));
    return;
  }

  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (requestUrl.pathname === '/api/matches') {
    const date = requestUrl.searchParams.get('date') || '';
    if (!/^\d{8}$/.test(date)) {
      respond(response, 400, JSON.stringify({ error: 'La fecha debe tener formato AAAAMMDD.' }));
      return;
    }
    await proxyFotMob(response, `https://www.fotmob.com/api/data/matches?date=${date}`);
    return;
  }

  if (requestUrl.pathname === '/api/leagues') {
    const id = Number(requestUrl.searchParams.get('id'));
    if (!leagueIds.has(id)) {
      respond(response, 400, JSON.stringify({ error: 'Competición no reconocida.' }));
      return;
    }
    await proxyFotMob(response, `https://www.fotmob.com/api/data/leagues?id=${id}&ccode3=USA`);
    return;
  }

  const file = publicFiles[requestUrl.pathname];
  if (!file) {
    respond(response, 404, JSON.stringify({ error: 'No encontrado.' }));
    return;
  }

  fs.readFile(path.join(__dirname, file[0]), (error, content) => {
    if (error) {
      respond(response, 500, JSON.stringify({ error: 'No se pudo leer la página.' }));
      return;
    }
    respond(response, 200, content, file[1]);
  });
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE' && server.address() === null) {
    server.listen((server.requestedPort || port) + 1, '127.0.0.1');
    server.requestedPort = (server.requestedPort || port) + 1;
    return;
  }
  console.error(error.message);
  process.exitCode = 1;
});

server.on('listening', () => {
  console.log(`Fútbol al Día disponible en http://127.0.0.1:${server.address().port}`);
});
server.requestedPort = port;
server.listen(port, '127.0.0.1');