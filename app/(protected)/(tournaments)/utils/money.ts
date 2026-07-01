/** Formats a money amount in the given ISO currency for the es-AR locale. */
export function formatMoney(amount: number, currency = 'ARS'): string {
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'decimal',
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
      compactDisplay: 'short'
    }).format(amount)
  } catch {
    return `${currency} ${amount}`
  }
}
