/** Lifecycle of a service fee settlement payment. Stored as INTEGER. */
export enum PaymentStatus {
  /** Checkout created, waiting for the payer / Mercado Pago to confirm. */
  PENDING = 1,
  /** Payment confirmed; every tournament it covers was marked as settled. */
  APPROVED = 2,
  /** Payment rejected by Mercado Pago. */
  REJECTED = 3,
  /** Checkout cancelled / expired without payment. */
  CANCELLED = 4
}

export const PaymentStatusNames: Record<PaymentStatus, string> = {
  [PaymentStatus.PENDING]: 'Pendiente',
  [PaymentStatus.APPROVED]: 'Aprobado',
  [PaymentStatus.REJECTED]: 'Rechazado',
  [PaymentStatus.CANCELLED]: 'Cancelado'
}
