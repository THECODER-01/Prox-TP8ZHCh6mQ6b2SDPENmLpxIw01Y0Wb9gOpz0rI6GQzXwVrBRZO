import Fastify from 'fastify';
import { createServer } from 'node:http';
import pwdCfg from './password-config.mjs';
import authRoutes from './authRoutes.mjs';
import adminRoutes from './adminRoutes.mjs';
import notesRoutes from './notesRoutes.mjs';
import { getSession } from './sessions.mjs';
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import createRammerhead from '../lib/rammerhead/src/server/index.js';
import fastifyHelmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import {
  config,
  serverUrl,
  pages,
  externalPages,
  getAltPrefix,
} from './routes.mjs';
import { tryReadFile, preloaded404 } from './templates.mjs';
import { fileURLToPath } from 'node:url';
import { existsSync, unlinkSync } from 'node:fs';

/* Record the server's location as a URL object, including its host and port.
 * The host can be modified at /src/config.json, whereas the ports can be modified
 * at /ecosystem.config.js.
 */
console.log(serverUrl);

// Wisp Configuration: Refer to the documentation at https://www.npmjs.com/package/@mercuryworkshop/wisp-js

logging.set_level(logging.NONE);
wisp.options.allow_udp_streams = false;
wisp.options.allow_loopback_ips = true;

// For security reasons only allow these ports. Any additional regional proxies or default sandboxed Tor ports should be added here.
wisp.options.port_whitelist = [
  80,
  443,
  9050,
  7000,
  7001
];

// The server will check for the existence of this file when a shutdown is requested.
// The shutdown script in run-command.js will temporarily produce this file.
const shutdown = fileURLToPath(new URL('./.shutdown', import.meta.url));

const rh = createRammerhead();
const rammerheadScopes = [
  '/rammerhead.js',
  '/hammerhead.js',
  '/transport-worker.js',
  '/task.js',
  '/iframe-task.js',
  '/worker-hammerhead.js',
  '/messaging',
  '/sessionexists',
  '/deletesession',
  '/newsession',
  '/editsession',
  '/needpassword',
  '/syncLocalStorage',
  '/api/shuffleDict',
  '/mainport',
].map((pathname) => pathname.replace('/', serverUrl.pathname));

const rammerheadSession = new RegExp(
    `^${serverUrl.pathname.replaceAll('.', '\\.')}[a-z0-9]{32}`
  ),
  shouldRouteRh = (req) => {
    try {
      const url = new URL(req.url, serverUrl);
      return (
        rammerheadScopes.includes(url.pathname) ||
        rammerheadSession.test(url.pathname)
      );
    } catch (e) {
      return false;
    }
  },
  routeRhRequest = (req, res) => {
    req.url = req.url.slice(serverUrl.pathname.length - 1);
    rh.emit('request', req, res);
  },
  routeRhUpgrade = (req, socket, head) => {
    req.url = req.url.slice(serverUrl.pathname.length - 1);
    rh.emit('upgrade', req, socket, head);
  };

// Create a server factory for Rammerhead and Wisp
const serverFactory = (handler) => {
  return createServer()
    .on('request', (req, res) => {
      if (shouldRouteRh(req)) routeRhRequest(req, res);
      else handler(req, res);
    })
    .on('upgrade', (req, socket, head) => {
      if (shouldRouteRh(req)) routeRhUpgrade(req, socket, head);
      else if (req.url.endsWith(getAltPrefix('wisp', serverUrl.pathname)))
        wisp.routeRequest(req, socket, head);
    });
};

// Set logger to true for logs.
const app = Fastify({
  routerOptions: {
    ignoreDuplicateSlashes: true,
    ignoreTrailingSlash: true,
  },
  logger: true,
  serverFactory: serverFactory,
});

// Apply Helmet middleware for security.
app.register(fastifyHelmet, {
  contentSecurityPolicy: false, // Disable CSP
  xPoweredBy: false,
});

// Assign server file paths to different paths, for serving content on the website.
app.register(fastifyStatic, {
  root: fileURLToPath(new URL('../views/dist/pages', import.meta.url)),
  prefix: serverUrl.pathname,
  decorateReply: false,
});

// All entries in the dist folder are created with source rewrites.
// Minified scripts are also served here, if minification is enabled.
[
  'assets',
  'archive',
  'uv',
  'scram',
  'epoxy',
  'libcurl',
  'baremux',
  'chii',
].forEach((prefix) => {
  app.register(fastifyStatic, {
    root: fileURLToPath(new URL('../views/dist/' + prefix, import.meta.url)),
    prefix: getAltPrefix(prefix, serverUrl.pathname),
    decorateReply: false,
  });
});

app.register(fastifyStatic, {
  root: fileURLToPath(
    new URL('../views/dist/archive/gfiles/rarch', import.meta.url)
  ),
  prefix: getAltPrefix('serving', serverUrl.pathname),
  decorateReply: false,
});

// You should NEVER commit roms, due to piracy concerns.
['cores', 'info', 'roms'].forEach((prefix) => {
  app.register(fastifyStatic, {
    root: fileURLToPath(
      new URL('../views/dist/archive/gfiles/rarch/' + prefix, import.meta.url)
    ),
    prefix: getAltPrefix(prefix, serverUrl.pathname),
    decorateReply: false,
  });
});

app.register(fastifyStatic, {
  root: fileURLToPath(
    new URL('../views/dist/archive/gfiles/rarch/cores', import.meta.url)
  ),
  prefix: getAltPrefix('uauth', serverUrl.pathname),
  decorateReply: false,
});

/* If you are trying to add pages or assets in the root folder and
 * NOT entire folders, check ./src/routes.mjs and add it manually.
 *
 * All website files are stored in the /views directory.
 * This takes one of those files and displays it for a site visitor.
 * Paths like /browsing are converted into paths like /views/dist/pages/surf.html
 * back here. Which path converts to what is defined in routes.mjs.
 */

const supportedTypes = {
    default: config.disguiseFiles ? 'image/vnd.microsoft.icon' : 'text/html',
    html: 'text/html',
    txt: 'text/plain',
    xml: 'application/xml',
    ico: 'image/vnd.microsoft.icon',
  },
  disguise = 'ico';
const parseCookies = (req) => {
  const header = req.headers && (req.headers.cookie || '') || '';
  return Object.fromEntries(
    header
      .split(';')
      .map((c) => c.trim())
      .filter(Boolean)
      .map((kv) => {
        const idx = kv.indexOf('=');
        return idx === -1
          ? [kv, '']
          : [kv.slice(0, idx), decodeURIComponent(kv.slice(idx + 1))];
      })
  );
};

// Enforce site password using the central password config when enabled.
app.addHook('preHandler', (req, reply, done) => {
  if (!pwdCfg.isEnabled()) return done();
  try {
    const reqPath = new URL(req.url, serverUrl).pathname.slice(serverUrl.pathname.length);
    // Exempted paths (assets, service workers, rammerhead scripts) and auth endpoints
    const protectedRh = ['newsession', 'editsession', 'deletesession'];
    if (
      reqPath === 'auth/login' ||
      reqPath === 'auth/register' ||
      reqPath === 'favicon.ico' ||
      reqPath.startsWith('assets/') ||
      reqPath.startsWith('uv/') ||
      reqPath.startsWith('scram/') ||
      reqPath.startsWith('epoxy/') ||
      reqPath.startsWith('libcurl/') ||
      reqPath.startsWith('baremux/') ||
      reqPath.startsWith('chii/') ||
      (rammerheadSession.test(serverUrl.pathname + reqPath) && !protectedRh.includes(reqPath))
    )
      return done();

    const cookies = getSession((parseCookies(req.raw) || {})['site-user']);
    if (cookies) return done();

    reply.redirect(serverUrl.pathname + 'auth/login');
    reply.hijack();
    return done();
  } catch (e) {
    return done();
  }
});

// CSRF protection: double-submit cookie pattern for POST requests (exempting login/register)
app.addHook('preHandler', (req, reply, done) => {
  try {
    if (req.method !== 'POST') return done();
    const reqPath = new URL(req.url, serverUrl).pathname.slice(serverUrl.pathname.length);
    const csrfExempt = ['auth/login', 'auth/register'];
    if (csrfExempt.includes(reqPath)) return done();
    const cookies = parseCookies(req.raw);
    const cookieToken = cookies['csrf-token'];
    const headerToken = req.headers['x-csrf-token'];
    if (!cookieToken || !headerToken || decodeURIComponent(cookieToken) !== headerToken) {
      reply.code(403).type('text/plain').send('CSRF token missing or invalid');
      reply.hijack();
      return done();
    }
    return done();
  } catch (e) {
    return done();
  }
});
if (config.disguiseFiles) {
  const getActualPath = (path) =>
      path.slice(0, path.length - 1 - disguise.length),
    shouldNotHandle = new RegExp(`\\.(?!html$|${disguise}$)[\\w-]+$`, 'i'),
    loaderFile = tryReadFile(
      '../views/dist/pages/misc/deobf/loader.html',
      import.meta.url,
      true
    );
  let exemptDirs = [
      'assets',
      'uv',
      'scram',
      'epoxy',
      'libcurl',
      'baremux',
      'wisp',
      'chii',
    ].map((dir) => getAltPrefix(dir, serverUrl.pathname).slice(1, -1)),
    exemptPages = ['login', 'test-shutdown', 'favicon.ico'];
  for (const [key, value] of Object.entries(externalPages))
    if ('string' === typeof value) exemptPages.push(key);
    else exemptDirs.push(key);
  for (const path of rammerheadScopes)
    if (!shouldNotHandle.test(path)) exemptDirs.push(path.slice(1));
  exemptPages = exemptPages.concat(exemptDirs);
  if (pages.default === 'login') exemptPages.push('');

  app.addHook('preHandler', (req, reply, done) => {
    if (req.params.modified) return done();
    const reqPath = new URL(req.url, serverUrl).pathname.slice(
      serverUrl.pathname.length
    );
    if (
      shouldNotHandle.test(reqPath) ||
      exemptDirs.some((dir) => reqPath.indexOf(dir + '/') === 0) ||
      exemptPages.includes(reqPath) ||
      rammerheadSession.test(serverUrl.pathname + reqPath)
    )
      return done();

    if (!reqPath.endsWith('.' + disguise)) {
      reply.type(supportedTypes.html).send(loaderFile);
      reply.hijack();
      return done();
    } else if (!(reqPath in pages) && !reqPath.endsWith('favicon.ico')) {
      req.params.modified = true;
      req.raw.url = getActualPath(req.raw.url);
      if (req.params.path) req.params.path = getActualPath(req.params.path);
      if (req.params['*']) req.params['*'] = getActualPath(req.params['*']);
      reply.type(supportedTypes[disguise]);
      reply.header('Access-Control-Allow-Origin', 'null');
    }
    return done();
  });
}

app.get(serverUrl.pathname + ':path', (req, reply) => {
  // Testing for future features that need cookies to deliver alternate source files.
  /*
  if (req.raw.rawHeaders.includes('Cookie'))
    console.log(
      'cookie:',
      req.raw.rawHeaders[req.raw.rawHeaders.indexOf('Cookie') + 1]
    );
  */

  const reqPath = req.params.path;

  // Ignore browsers' automatic requests to favicon.ico, since it does not exist.
  // This approach is needed for certain pages to not have an icon.
  if (reqPath === 'favicon.ico') {
    reply.send();
    return reply.hijack();
  }

  if (reqPath in externalPages) {
    if (req.params.modified)
      return reply.code(404).type(supportedTypes.html).send(preloaded404);
    let externalRoute = externalPages[reqPath];
    if (typeof externalRoute !== 'string')
      externalRoute = externalRoute.default;
    return reply.redirect(externalRoute);
  }

  // If a GET request is sent to /test-shutdown and a script-generated shutdown file
  // is present, gracefully shut the server down.
  if (reqPath === 'test-shutdown' && existsSync(shutdown)) {
    console.log('Holy Unblocker is shutting down.');
    app.close();
    unlinkSync(shutdown);
    process.exitCode = 0;
  }

  // Return the error page if the query is not found in routes.mjs.
  if (reqPath && !(reqPath in pages))
    return reply.code(404).type(supportedTypes.default).send(preloaded404);

  // Serve the default page if the path is the default path.
  const fileName = reqPath ? pages[reqPath] : pages[pages.default],
    type =
      supportedTypes[fileName.slice(fileName.lastIndexOf('.') + 1)] ||
      supportedTypes.default;

  if (req.params.modified) reply.type(supportedTypes[disguise]);
  else reply.type(type);
  reply.send(tryReadFile('../views/dist/' + fileName, import.meta.url));
});

// Login page — GET serves the form, POST validates credentials and sets a secure cookie.
app.get(serverUrl.pathname + 'login', (req, reply) => {
  // Only expose the login page when the site password is enabled. Otherwise redirect to site root.
  if (!pwdCfg.isEnabled()) return reply.redirect(serverUrl.pathname);
  reply.header('Cache-Control', 'no-store');
  reply.header('Pragma', 'no-cache');
  return reply.type(supportedTypes.default).send(tryReadFile('../views/dist/pages/misc/deobf/anti-exfil.html', import.meta.url));
});

// Logout and revoke session token (if present)
app.post(serverUrl.pathname + 'logout', (req, reply) => {
  if (!pwdCfg.isEnabled()) return reply.redirect(serverUrl.pathname + 'login');
  const cookies = parseCookies(req.raw);
  const token = cookies[pwdCfg.cookieName];
  if (token && pwdCfg.revokeToken) pwdCfg.revokeToken(token);
  // Clear cookie
  reply.header('Set-Cookie', `${pwdCfg.cookieName}=; Path=${serverUrl.pathname}; Max-Age=0; HttpOnly; SameSite=Strict`);
  return reply.redirect(serverUrl.pathname + 'login');
});

app.post(serverUrl.pathname + 'login', async (req, reply) => {
  if (!pwdCfg.isEnabled()) return reply.redirect(serverUrl.pathname);
  // Manual body parsing for application/x-www-form-urlencoded to avoid @fastify/formbody version mismatch
  const ct = (req.headers['content-type'] || '').toLowerCase();
  let pwd = '';
  if (ct.includes('application/x-www-form-urlencoded')) {
    const raw = await new Promise((resolve, reject) => {
      let data = '';
      req.raw.on('data', (chunk) => (data += chunk));
      req.raw.on('end', () => resolve(data));
      req.raw.on('error', reject);
    });
    pwd = new URLSearchParams(raw).get('pwd') || '';
  } else {
    pwd = (req.body && req.body.pwd) || '';
  }

  if (!pwd) return reply.redirect(serverUrl.pathname + 'login?bad=1');
  // Create a session token (preferred) or fallback to password compare
  const token = pwdCfg.createToken(pwd);
  if (token) {
    let cookie = `${pwdCfg.cookieName}=${token}; Path=${serverUrl.pathname}; HttpOnly; SameSite=Strict`;
    if (pwdCfg.cookieOptions && pwdCfg.cookieOptions.maxAge)
      cookie += `; Max-Age=${pwdCfg.cookieOptions.maxAge}`;
    if ((req.raw.socket && req.raw.socket.encrypted) || serverUrl.protocol === 'https:') cookie += '; Secure';
    reply.header('Set-Cookie', cookie);
    return reply.redirect(serverUrl.pathname);
  }
  // fallback: maybe old-style direct password comparison
  if (pwdCfg.verify(pwd)) {
    const hash = pwdCfg.hash(pwd);
    let cookie = `${pwdCfg.cookieName}=${hash}; Path=${serverUrl.pathname}; HttpOnly; SameSite=Strict`;
    if (pwdCfg.cookieOptions && pwdCfg.cookieOptions.maxAge)
      cookie += `; Max-Age=${pwdCfg.cookieOptions.maxAge}`;
    if ((req.raw.socket && req.raw.socket.encrypted) || serverUrl.protocol === 'https:') cookie += '; Secure';
    reply.header('Set-Cookie', cookie);
    return reply.redirect(serverUrl.pathname);
  }
  return reply.redirect(serverUrl.pathname + 'login?bad=1');
});

// Register the auth routes (username/password + invite registration)
authRoutes(app, serverUrl);
// Register admin routes (admin panel & management)
adminRoutes(app, serverUrl);
// Register notes routes (user notes / comments / todos)
notesRoutes(app, serverUrl);

app.get(serverUrl.pathname + 'github/:redirect', (req, reply) => {
  if (req.params.redirect in externalPages.github)
    reply.redirect(externalPages.github[req.params.redirect]);
  else reply.code(404).type(supportedTypes.default).send(preloaded404);
});

if (serverUrl.pathname === '/')
  // Set an error page for invalid paths outside the query string system.
  // If the server URL has a prefix, then avoid doing this for stealth reasons.
  app.setNotFoundHandler((req, reply) => {
    reply.code(404).type(supportedTypes.default).send(preloaded404);
  });
else {
  // Apply the following patch(es) if the server URL has a prefix.

  // Patch to fix serving index.html.
  app.get(serverUrl.pathname, (req, reply) => {
    reply
      .type(supportedTypes.default)
      .send(tryReadFile('../views/dist/' + pages.index, import.meta.url));
  });
}

app.listen({ port: serverUrl.port, host: serverUrl.hostname });
console.log(`Holy Unblocker is listening on port ${serverUrl.port}.`);
console.log(`When hosting with a reverse proxy please ensure you are using NGINX only.\nCaddy and Apache are not supported and have security risks due to wisp-js and loopbacks.\nPorts are whitelisted and security is maintained with NGINX only.`);
if (config.disguiseFiles)
  console.log(
    'disguiseFiles is enabled. Visit src/routes.mjs to see the entry point, listed within the pages variable.'
  );
