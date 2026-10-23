// Apply the page policy after Netlify's static-header processing. This keeps
// same-origin Guest Locker fetches available even when an older cached header
// rule exists at the site level.
const policy = "default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";

export default async (_request, context) => {
  const response = await context.next({ sendConditionalRequest: true });
  const headers = new Headers(response.headers);
  headers.set('content-security-policy', policy);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

export const config = { path: ['/', '/me230-bench.html'] };
