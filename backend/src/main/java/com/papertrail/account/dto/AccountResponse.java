package com.papertrail.account.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.papertrail.account.User;

/**
 * @param today            the current date in the household's timezone
 * @param currencyLocked   true once bills or schedules exist; the currency is then fixed so totals never mix
 */
public record AccountResponse(
        UUID id,
        String email,
        String displayName,
        String currency,
        String timezone,
        int defaultReminderLeadDays,
        LocalDate today,
        boolean currencyLocked,
        Instant createdAt) {

    public static AccountResponse from(User user, LocalDate today, boolean currencyLocked) {
        return new AccountResponse(user.getId(), user.getEmail(), user.getDisplayName(), user.getCurrency(),
                user.getTimezone(), user.getDefaultReminderLeadDays(), today, currencyLocked, user.getCreatedAt());
    }
}
