package com.papertrail.analytics.dto;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;

/** All money values are decimal strings in the account currency, computed with SQL numeric arithmetic. */
public final class AnalyticsDtos {

    private AnalyticsDtos() {
    }

    public record Figure(String total, long count) {
    }

    /**
     * @param rangeApplied when false, outstanding/overdue cover every unpaid bill and billed/paid cover the
     *                     current month; when true all figures are limited to the requested month range
     */
    public record SummaryResponse(
            String currency,
            LocalDate today,
            YearMonth from,
            YearMonth to,
            boolean rangeApplied,
            UUID providerId,
            Figure outstanding,
            Figure overdue,
            Figure dueNext7Days,
            Figure billed,
            Figure paid) {
    }

    public record MonthTotals(YearMonth month, String billed, long billedCount, String paid, long paidCount) {
    }

    public record MonthlyResponse(String currency, YearMonth from, YearMonth to, UUID providerId,
            List<MonthTotals> months, String billedTotal, String paidTotal) {
    }

    public record CategoryShare(UUID categoryId, String name, String total, long billCount, String sharePercent) {
    }

    public record CategoryBreakdownResponse(String currency, YearMonth from, YearMonth to, UUID providerId,
            String total, List<CategoryShare> categories) {
    }

    /** @param averagePerMonth total divided by the number of months in the range (effective monthly cost) */
    public record ProviderSeries(UUID providerId, String name, String total, String averagePerMonth, long billCount,
            List<String> values) {
    }

    public record ProviderTrendResponse(String currency, YearMonth from, YearMonth to, List<YearMonth> months,
            List<ProviderSeries> providers) {
    }
}
