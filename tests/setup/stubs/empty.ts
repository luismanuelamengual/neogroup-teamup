/* eslint-disable */
/**
 * Generic inert stub used to replace Next.js / next-auth modules that execute
 * runtime-only code at import time. The tournament engine never calls into them.
 *
 * The default export is callable and returns an empty object so that, even if a
 * real module (e.g. NextAuth(), Google(), Credentials()) slips through, invoking
 * it does not throw.
 */
function stub(): Record<string, unknown> {
  return {}
}

export const headers = async () => new Map()
export const cookies = async () => new Map()
export const cache = <T>(fn: T): T => fn
export class NextResponse {}
export class NextRequest {}
export const auth = async () => null
export const getSession = async () => null
export default stub
