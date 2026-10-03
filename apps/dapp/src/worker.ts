const ORIGIN = 'https://devnet.payrail.one';

interface WorkerEnvironment {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const apiHeaders = {
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET, HEAD, POST, OPTIONS',
  'access-control-allow-origin': '*',
  'access-control-max-age': '86400',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

const siteHeaders = {
  'content-security-policy':
    "default-src 'self'; base-uri 'none'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com",
  'permissions-policy':
    'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
};

function withHeaders(
  response: Response,
  values: Record<string, string>,
): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(values)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function devnetApi(request: Request, path: string): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: apiHeaders });
  }
  if (!['GET', 'HEAD', 'POST'].includes(request.method)) {
    return withHeaders(
      new Response('method not allowed', { status: 405 }),
      apiHeaders,
    );
  }
  const upstream = new URL(path, ORIGIN);
  const response = await fetch(upstream, {
    method: request.method,
    headers: {
      accept: 'application/json',
      ...(request.headers.get('content-type') === 'application/json'
        ? { 'content-type': 'application/json' }
        : {}),
    },
    body: request.method === 'POST' ? request.body : null,
    redirect: 'manual',
  });
  return withHeaders(response, apiHeaders);
}

export default {
  async fetch(
    request: Request,
    environment: WorkerEnvironment,
  ): Promise<Response> {
    const incoming = new URL(request.url);
    if (incoming.protocol === 'http:') {
      incoming.protocol = 'https:';
      return Response.redirect(incoming, 308);
    }
    if (incoming.pathname === '/api/network') {
      return devnetApi(request, '/api/status');
    }
    if (
      incoming.pathname === '/api/faucet' ||
      incoming.pathname === '/api/transactions' ||
      incoming.pathname.startsWith('/api/accounts/') ||
      incoming.pathname.startsWith('/api/contracts/')
    ) {
      return devnetApi(request, incoming.pathname);
    }
    if (incoming.pathname.startsWith('/api/')) {
      return withHeaders(
        new Response('not found', { status: 404 }),
        apiHeaders,
      );
    }
    return withHeaders(await environment.ASSETS.fetch(request), siteHeaders);
  },
};
