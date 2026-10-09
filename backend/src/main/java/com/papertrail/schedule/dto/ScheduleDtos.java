package com.papertrail.schedule.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.papertrail.bill.dto.BillDtos.BillSummaryResponse;
import com.papertrail.common.NamedRef;
import com.papertrail.schedule.Frequency;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public final class ScheduleDtos {

    private ScheduleDtos() {
    }

    public record ScheduleRequest(
            @NotBlank(message = "Enter a title.")
            @Size(max = 160, message = "Use at most 160 characters.")
            String title,
            @NotNull(message = "Choose a provider.")
            UUID providerId,
            @NotNull(message = "Choose a category.")
            UUID categoryId,
            @NotNull(message = "Enter the usual amount.")
            @DecimalMin(value = "0.00", message = "The amount can't be negative.")
            @Digits(integer = 10, fraction = 2, message = "Use at most two decimal places.")
            BigDecimal amount,
            @NotNull(message = "Choose how often this bill arrives.")
            Frequency frequency,
            @NotNull(message = "Choose a start date.")
            LocalDate startDate,
            @NotNull(message = "Choose a billing day.")
            @Min(value = 1, message = "Use a day from 1 to 31.")
            @Max(value = 31, message = "Use a day from 1 to 31.")
            Integer billingDay,
            @NotNull(message = "Choose a reminder lead time.")
            @Min(value = 0, message = "Use 0 to 60 days.")
            @Max(value = 60, message = "Use 0 to 60 days.")
            Integer reminderLeadDays,
            Boolean active,
            @Size(max = 2000, message = "Notes can be at most 2000 characters.")
            String notes,
            Long version) {
    }

    public record PreviewRequest(
            @NotNull(message = "Choose a start date.") LocalDate startDate,
            @NotNull(message = "Choose a billing day.")
            @Min(value = 1, message = "Use a day from 1 to 31.")
            @Max(value = 31, message = "Use a day from 1 to 31.")
            Integer billingDay,
            @NotNull(message = "Choose a frequency.") Frequency frequency,
            @Min(1) @Max(24) Integer count) {
    }

    public record PreviewResponse(List<LocalDate> dates) {
    }

    /**
     * @param upcoming        next due dates on or after today (or the start date)
     * @param lastGenerated   due date of the most recent generated instance, if any
     */
    public record ScheduleResponse(
            UUID id,
            String title,
            NamedRef provider,
            NamedRef category,
            String amount,
            String currency,
            Frequency frequency,
            LocalDate startDate,
            int billingDay,
            int reminderLeadDays,
            boolean active,
            String notes,
            List<LocalDate> upcoming,
            LocalDate lastGenerated,
            long generatedCount,
            Instant createdAt,
            long version) {
    }

    public record ScheduleDetailResponse(ScheduleResponse schedule, List<BillSummaryResponse> recentBills) {
    }
}
