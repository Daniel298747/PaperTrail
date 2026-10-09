package com.papertrail.notification;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.papertrail.bill.Bill;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/** In-app notification. Rows are inserted by {@link ReminderService} with an idempotent SQL insert. */
@Entity
@Table(name = "notifications")
public class Notification {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "bill_id", updatable = false)
    private Bill bill;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20, updatable = false)
    private NotificationType type;

    @Column(name = "reference_date", nullable = false, updatable = false)
    private LocalDate referenceDate;

    @Column(nullable = false, length = 200, updatable = false)
    private String title;

    @Column(nullable = false, length = 500, updatable = false)
    private String body;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "read_at")
    private Instant readAt;

    protected Notification() {
    }

    public void markRead(Instant at) {
        if (readAt == null) {
            readAt = at;
        }
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public Bill getBill() {
        return bill;
    }

    public NotificationType getType() {
        return type;
    }

    public LocalDate getReferenceDate() {
        return referenceDate;
    }

    public String getTitle() {
        return title;
    }

    public String getBody() {
        return body;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getReadAt() {
        return readAt;
    }
}
