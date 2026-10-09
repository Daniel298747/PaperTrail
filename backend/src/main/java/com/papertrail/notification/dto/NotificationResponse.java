package com.papertrail.notification.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.papertrail.bill.BillStatus;
import com.papertrail.notification.NotificationType;

/**
 * @param bill the linked bill with its <em>current</em> status, so an old reminder for a bill that has since
 *             been paid can say so
 */
public record NotificationResponse(
        UUID id,
        NotificationType type,
        String title,
        String body,
        LocalDate referenceDate,
        Instant createdAt,
        Instant readAt,
        LinkedBill bill) {

    public record LinkedBill(UUID id, String title, String providerName, String amount, String currency,
            LocalDate dueDate, BillStatus status) {
    }
}
