package com.papertrail.notification;

import java.util.Map;
import java.util.UUID;

import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.papertrail.common.PageResponse;
import com.papertrail.notification.dto.NotificationResponse;
import com.papertrail.security.AuthUser;
import com.papertrail.security.CurrentUser;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final NotificationService notifications;

    public NotificationController(NotificationService notifications) {
        this.notifications = notifications;
    }

    @GetMapping
    public PageResponse<NotificationResponse> list(@CurrentUser AuthUser user,
            @RequestParam(defaultValue = "false") boolean unreadOnly,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return notifications.list(user.id(), unreadOnly, PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, 100)));
    }

    @GetMapping("/unread-count")
    public Map<String, Long> unreadCount(@CurrentUser AuthUser user) {
        return Map.of("count", notifications.unreadCount(user.id()));
    }

    @PostMapping("/{id}/read")
    public ResponseEntity<Void> markRead(@CurrentUser AuthUser user, @PathVariable UUID id) {
        notifications.markRead(user.id(), id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/read-all")
    public Map<String, Integer> markAllRead(@CurrentUser AuthUser user) {
        return Map.of("updated", notifications.markAllRead(user.id()));
    }
}
