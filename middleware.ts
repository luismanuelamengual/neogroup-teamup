/**
 * Next.js middleware entry point.
 *
 * Next.js only recognises the file "middleware.ts" (or middleware.js) at the
 * project root as the middleware. The actual implementation lives in proxy.ts
 * so it can be imported and tested independently.
 */
export { proxy as default, config } from './proxy'
