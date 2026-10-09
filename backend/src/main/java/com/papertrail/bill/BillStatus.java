package com.papertrail.bill;

import java.time.LocalDate;

/** Status shown to people: an unpaid bill whose due date is before today (account timezone) is overdue. */
public enum BillStatus {
    PAID, UNPAID, OVERDUE;

    public static BillStatus derive(PaymentStatus stored, LocalDate dueDate, LocalDate today) {
        if (stored == PaymentStatus.PAID) {
            return PAID;
        }
        return dueDate.isBefore(today) ? OVERDUE : UNPAID;
    }
}
