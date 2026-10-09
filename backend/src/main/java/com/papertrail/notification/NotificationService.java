package com.papertrail.notification;

import java.time.LocalDate;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.papertrail.account.AccountService;
import com.papertrail.account.HouseholdTime;
import com.papertrail.bill.Bill;
import com.papertrail.common.ApiException;
import com.papertrail.common.Money;
import com.papertrail.common.PageResponse;
import com.papertrail.notification.dto.NotificationResponse;
import com.papertrail.notification.dto.NotificationResponse.LinkedBill;

@Service
public class NotificationService {

    private final NotificationRepository notifications;
    private final AccountService accounts;
    private final HouseholdTime time;

    public NotificationService(NotificationRepository notifications, AccountService accounts, HouseholdTime time) {
        this.notifications = notifications;
        this.accounts = accounts;
        this.time = time;
    }

    @Transactional(readOnly = true)
    public PageResponse<NotificationResponse> list(UUID userId, boolean unreadOnly, Pageable pageable) {
        LocalDate today = time.today(accounts.require(userId));
        Page<Notification> page = unreadOnly
                ? notifications.findByUserIdAndReadAtIsNullOrderByCreatedAtDesc(userId, pageable)
                : notifications.findByUserIdOrderByCreatedAtDesc(userId, pageable);
        return PageResponse.of(page, n -> toResponse(n, today));
    }

    @Transactional(readOnly = true)
    public long unreadCount(UUID userId) {
        return notifications.countByUserIdAndReadAtIsNull(userId);
    }

    @Transactional
    public void markRead(UUID userId, UUID notificationId) {
        Notification notification = notifications.findByIdAndUserId(notificationId, userId)
                .orElseThrow(() -> ApiException.notFound("Notification"));
        notification.markRead(time.now());
    }

    @Transactional
    public int markAllRead(UUID userId) {
        return notifications.markAllRead(userId, time.now());
    }

    private static NotificationResponse toResponse(Notification n, LocalDate today) {
        Bill bill = n.getBill();
        LinkedBill linked = bill == null ? null
                : new LinkedBill(bill.getId(), bill.getTitle(), bill.getProvider().getName(),
                        Money.format(bill.getAmount()), bill.getCurrency(), bill.getDueDate(),
                        bill.effectiveStatus(today));
        return new NotificationResponse(n.getId(), n.getType(), n.getTitle(), n.getBody(), n.getReferenceDate(),
                n.getCreatedAt(), n.getReadAt(), linked);
    }
}
