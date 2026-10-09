package com.papertrail.bill;

/** What is stored. Overdue is derived, never persisted (see {@link BillStatus}). */
public enum PaymentStatus {
    UNPAID, PAID
}
