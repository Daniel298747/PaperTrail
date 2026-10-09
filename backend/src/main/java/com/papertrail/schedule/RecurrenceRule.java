package com.papertrail.schedule;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * Pure date arithmetic for recurring bills.
 *
 * <p>The first occurrence is the first billing day on or after {@code startDate}; later occurrences fall
 * every {@code frequency.months()} months after it. Each occurrence is computed from the original
 * anchor day rather than from the previous date, so a schedule anchored to the 31st lands on 28 or 29
 * February and returns to the 31st in March.
 */
public record RecurrenceRule(LocalDate startDate, int billingDay, Frequency frequency) {

    public RecurrenceRule {
        Objects.requireNonNull(startDate, "startDate");
        Objects.requireNonNull(frequency, "frequency");
        if (billingDay < 1 || billingDay > 31) {
            throw new IllegalArgumentException("billingDay must be between 1 and 31");
        }
    }

    /** The billing date inside a given month, clamped to the month's length. */
    public static LocalDate dateInMonth(YearMonth month, int billingDay) {
        return month.atDay(Math.min(billingDay, month.lengthOfMonth()));
    }

    public LocalDate firstOccurrence() {
        YearMonth startMonth = YearMonth.from(startDate);
        LocalDate candidate = dateInMonth(startMonth, billingDay);
        return candidate.isBefore(startDate) ? dateInMonth(startMonth.plusMonths(1), billingDay) : candidate;
    }

    /** Occurrence number {@code index} (0-based). */
    public LocalDate occurrence(long index) {
        YearMonth firstMonth = YearMonth.from(firstOccurrence());
        return dateInMonth(firstMonth.plusMonths(index * frequency.months()), billingDay);
    }

    /** All occurrences with from <= date <= to, in ascending order. */
    public List<LocalDate> occurrencesBetween(LocalDate from, LocalDate to) {
        List<LocalDate> result = new ArrayList<>();
        if (to.isBefore(from)) {
            return result;
        }
        YearMonth firstMonth = YearMonth.from(firstOccurrence());
        long monthsToFrom = ChronoUnit.MONTHS.between(firstMonth, YearMonth.from(from));
        // Jump close to the window instead of iterating from the start date; step back one to be safe.
        long index = Math.max(0, monthsToFrom / frequency.months() - 1);
        while (true) {
            LocalDate date = occurrence(index);
            if (date.isAfter(to)) {
                return result;
            }
            if (!date.isBefore(from)) {
                result.add(date);
            }
            index++;
        }
    }

    /** The next {@code count} occurrences on or after {@code from}. */
    public List<LocalDate> nextOccurrences(LocalDate from, int count) {
        List<LocalDate> result = new ArrayList<>(count);
        YearMonth firstMonth = YearMonth.from(firstOccurrence());
        long monthsToFrom = ChronoUnit.MONTHS.between(firstMonth, YearMonth.from(from));
        long index = Math.max(0, monthsToFrom / frequency.months() - 1);
        while (result.size() < count) {
            LocalDate date = occurrence(index++);
            if (!date.isBefore(from)) {
                result.add(date);
            }
        }
        return result;
    }
}
