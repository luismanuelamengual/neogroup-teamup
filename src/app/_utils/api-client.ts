/** Minimal helper to call the REST API with JSON from client code. */

export async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  })

  return (await response.json()) as T
}
