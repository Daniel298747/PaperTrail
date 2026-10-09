package com.papertrail.bill.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.papertrail.bill.BillStatus;
import com.papertrail.common.NamedRef;
import com.papertrail.document.dto.DocumentDtos.DocumentVersionResponse;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public final class BillDtos {

    private BillDtos() {
    }

    /** Create/update payload. {@code version}, when sent on update, enables optimistic conflict detection. */
    public record BillRequest(
            @NotBlank(message = "Enter a title.")
            @Size(max = 160, message = "Use at most 160 characters.")
            String title,
            @NotNull(message = "Choose a provider.")
            UUID providerId,
            @NotNull(message = "Choose a category.")
            UUID categoryId,
            @NotNull(message = "Enter an amount.")
            @DecimalMin(value = "0.00", message = "The amount can't be negative.")
            @Digits(integer = 10, fraction = 2, message = "Use at most two decimal places.")
            BigDecimal amount,
            @NotNull(message = "Choose a due date.")
            LocalDate dueDate,
            @Min(value = 0, message = "Use 0 to 60 days.")
            @Max(value = 60, message = "Use 0 to 60 days.")
            Integer reminderLeadDays,
            @Size(max = 2000, message = "Notes can be at most 2000 characters.")
            String notes,
            Long version) {
    }

    /** {@code paidDate} defaults to today in the household's timezone. */
    public record PaymentRequest(LocalDate paidDate) {
    }

    /**
     * @param amount       decimal string, e.g. "84.20"
     * @param status       PAID, UNPAID or OVERDUE (derived from the due date in the household timezone)
     * @param daysUntilDue negative when overdue
     */
    public record BillSummaryResponse(
            UUID id,
            String title,
            NamedRef provider,
            NamedRef category,
            String amount,
            String currency,
            LocalDate dueDate,
            BillStatus status,
            LocalDate paidDate,
            long daysUntilDue,
            int documentCount,
            NamedRef schedule,
            long version) {
    }

    public record BillDetailResponse(
            UUID id,
            String title,
            NamedRef provider,
            NamedRef category,
            String amount,
            String currency,
            LocalDate dueDate,
            BillStatus status,
            LocalDate paidDate,
            long daysUntilDue,
            int reminderLeadDays,
            String notes,
            NamedRef schedule,
            List<DocumentVersionResponse> documents,
            Instant createdAt,
            Instant updatedAt,
            long version) {
    }
}
