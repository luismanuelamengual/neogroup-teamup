import { DatabaseSync } from 'node:sqlite'
import { E2E_DB_PATH } from '../env'

/**
 * Reads straight from the e2e SQLite file to fetch tokens that would normally
 * be delivered by email. The app itself never emails anything in this
 * environment (RESEND_API_KEY is unset — see app/utils/email.ts), so this is
 * how the tests "receive" the verification / password-reset link.
 *
 * Opened read-only and closed after every call so it never contends with the
 * Next.js server process holding its own connection to the same file.
 */
function withDb<T>(fn: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(E2E_DB_PATH, { readOnly: true })

  try {
    return fn(db)
  } finally {
    db.close()
  }
}

/** Returns the most recent email verification token issued for the given email, or null. */
export function getLatestEmailVerificationToken(email: string): string | null {
  return withDb((db) => {
    const row = db
      .prepare(
        `SELECT t.token AS token
         FROM email_verification_tokens t
         JOIN users u ON u.id = t.userId
         WHERE u.email = ?
         ORDER BY t.id DESC
         LIMIT 1`
      )
      .get(email) as { token: string } | undefined

    return row?.token ?? null
  })
}

/** Returns the most recent password reset token issued for the given email, or null. */
export function getLatestPasswordResetToken(email: string): string | null {
  return withDb((db) => {
    const row = db
      .prepare(
        `SELECT t.token AS token
         FROM password_reset_tokens t
         JOIN users u ON u.id = t.userId
         WHERE u.email = ?
         ORDER BY t.id DESC
         LIMIT 1`
      )
      .get(email) as { token: string } | undefined

    return row?.token ?? null
  })
}
