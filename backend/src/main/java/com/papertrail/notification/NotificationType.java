package com.papertrail.notification;

public enum NotificationType {
    /** Sent once the bill enters its reminder lead window. */
    BILL_DUE_SOON,
    /** Sent once, when an unpaid bill passes its due date. */
    BILL_OVERDUE
}
