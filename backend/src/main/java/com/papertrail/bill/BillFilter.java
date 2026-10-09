package com.papertrail.bill;

import java.time.LocalDate;
import java.util.UUID;

/**
 * List filters. Status values:
 * OUTSTANDING = every unpaid bill; UNPAID = unpaid and not yet overdue; OVERDUE; PAID.
 */
public record BillFilter(
        String text,
        StatusFilter status,
        UUID providerId,
        UUID categoryId,
        UUID scheduleId,
        LocalDate dueFrom,
        LocalDate dueTo) {

    public enum StatusFilter {
        OUTSTANDING, UNPAID, OVERDUE, PAID
    }
}
