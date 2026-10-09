package com.papertrail.account.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class AccountRequests {

    private AccountRequests() {
    }

    /** Partial update: null fields are left unchanged. */
    public record UpdateAccountRequest(
            @Size(min = 1, max = 80, message = "Use between 1 and 80 characters.") String displayName,
            @Size(max = 64) String timezone,
            @Size(min = 3, max = 3, message = "Use a three-letter currency code.") String currency,
            @Min(value = 0, message = "Use 0 to 60 days.") @Max(value = 60, message = "Use 0 to 60 days.")
            Integer defaultReminderLeadDays) {
    }

    public record ChangePasswordRequest(
            @NotBlank(message = "Enter your current password.") String currentPassword,
            @NotBlank(message = "Choose a new password.")
            @Size(min = 8, max = 72, message = "Use between 8 and 72 characters.")
            String newPassword) {
    }
}
