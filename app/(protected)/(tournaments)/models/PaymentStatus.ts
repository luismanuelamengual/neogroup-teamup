/** Lifecycle of a tournament registration payment. Stored as INTEGER. */
export enum PaymentStatus {
  /** Checkout created, waiting for the player to pay / Mercado Pago to confirm. */
  PENDING = 1,
  /** Payment confirmed; the competitor was registered. */
  APPROVED = 2,
  /** Payment rejected by Mercado Pago. */
  REJECTED = 3,
  /** Checkout cancelled / expired without payment. */
  CANCELLED = 4,
  /** Payment was approved but later refunded (e.g. registration could not be honoured). */
  REFUNDED = 5
}

export const PaymentStatusNames: Record<PaymentStatus, string> = {
  [PaymentStatus.PENDING]: 'Pendiente',
  [PaymentStatus.APPROVED]: 'Aprobado',
  [PaymentStatus.REJECTED]: 'Rechazado',
  [PaymentStatus.CANCELLED]: 'Cancelado',
  [PaymentStatus.REFUNDED]: 'Reembolsado'
}
