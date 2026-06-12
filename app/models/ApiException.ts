/**
 * Error to be thrown inside API handlers. `message` is a stable code the
 * FE can map to a translation; `status` is the HTTP status of the response.
 */
export class ApiException extends Error {
  constructor(message: string, public status = 400) {
    super(message)
    this.name = 'ApiException'
  }
}
