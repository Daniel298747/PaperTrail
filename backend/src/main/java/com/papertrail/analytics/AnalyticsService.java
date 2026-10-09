package com.papertrail.analytics;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.papertrail.account.AccountService;
import com.papertrail.account.HouseholdTime;
import com.papertrail.account.User;
import com.papertrail.analytics.dto.AnalyticsDtos.CategoryBreakdownResponse;
import com.papertrail.analytics.dto.AnalyticsDtos.CategoryShare;
import com.papertrail.analytics.dto.AnalyticsDtos.Figure;
import com.papertrail.analytics.dto.AnalyticsDtos.MonthTotals;
import com.papertrail.analytics.dto.AnalyticsDtos.MonthlyResponse;
import com.papertrail.analytics.dto.AnalyticsDtos.ProviderSeries;
import com.papertrail.analytics.dto.AnalyticsDtos.ProviderTrendResponse;
import com.papertrail.analytics.dto.AnalyticsDtos.SummaryResponse;
import com.papertrail.common.ApiException;
import com.papertrail.common.Money;

/**
 * Metric definitions (also documented in the README):
 * <ul>
 * <li><b>Outstanding</b>: sum of unpaid bills (overdue + not yet due).</li>
 * <li><b>Overdue</b>: unpaid bills whose due date is before today in the household timezone.</li>
 * <li><b>Billed</b> totals group bills by <em>due date</em>, whatever their status.</li>
 * <li><b>Paid</b> totals group paid bills by <em>payment date</em>.</li>
 * <li><b>By category</b> and <b>provider trends</b> are billed amounts (by due date).</li>
 * </ul>
 * Every query is pinned to the account currency so amounts in different currencies are never added.
 */
@Service
public class AnalyticsService {

    private static final int MAX_MONTHS = 60;

    private final JdbcClient jdbc;
    private final AccountService accounts;
    private final HouseholdTime time;

    public AnalyticsService(JdbcClient jdbc, AccountService accounts, HouseholdTime time) {
        this.jdbc = jdbc;
        this.accounts = accounts;
        this.time = time;
    }

    @Transactional(readOnly = true)
    public SummaryResponse summary(UUID userId, YearMonth from, YearMonth to, UUID providerId) {
        User user = accounts.require(userId);
        LocalDate today = time.today(user);
        boolean rangeApplied = from != null || to != null;
        Range range = rangeApplied ? resolve(from, to, today) : new Range(YearMonth.from(today), YearMonth.from(today));
        String dueInRange = rangeApplied ? " and due_date between :rangeStart and :rangeEnd" : "";
        String sql = """
                select
                  coalesce(sum(amount) filter (where status = 'UNPAID'%1$s), 0) as outstanding_total,
                  count(*) filter (where status = 'UNPAID'%1$s) as outstanding_count,
                  coalesce(sum(amount) filter (where status = 'UNPAID' and due_date < :today%1$s), 0) as overdue_total,
                  count(*) filter (where status = 'UNPAID' and due_date < :today%1$s) as overdue_count,
                  coalesce(sum(amount) filter (where status = 'UNPAID' and due_date between :today and :weekEnd%1$s), 0) as week_total,
                  count(*) filter (where status = 'UNPAID' and due_date between :today and :weekEnd%1$s) as week_count,
                  coalesce(sum(amount) filter (where due_date between :rangeStart and :rangeEnd), 0) as billed_total,
                  count(*) filter (where due_date between :rangeStart and :rangeEnd) as billed_count,
                  coalesce(sum(amount) filter (where status = 'PAID' and paid_date between :rangeStart and :rangeEnd), 0) as paid_total,
                  count(*) filter (where status = 'PAID' and paid_date between :rangeStart and :rangeEnd) as paid_count
                from bills
                where user_id = :userId and currency = :currency%2$s
                """.formatted(dueInRange, providerId == null ? "" : " and provider_id = :providerId");
        var spec = jdbc.sql(sql)
                .param("userId", userId)
                .param("currency", user.getCurrency())
                .param("today", today)
                .param("weekEnd", today.plusDays(6))
                .param("rangeStart", range.start())
                .param("rangeEnd", range.end());
        if (providerId != null) {
            spec = spec.param("providerId", providerId);
        }
        return spec.query((rs, rowNum) -> new SummaryResponse(user.getCurrency(), today, range.from(), range.to(),
                rangeApplied, providerId,
                figure(rs.getBigDecimal("outstanding_total"), rs.getLong("outstanding_count")),
                figure(rs.getBigDecimal("overdue_total"), rs.getLong("overdue_count")),
                figure(rs.getBigDecimal("week_total"), rs.getLong("week_count")),
                figure(rs.getBigDecimal("billed_total"), rs.getLong("billed_count")),
                figure(rs.getBigDecimal("paid_total"), rs.getLong("paid_count")))).single();
    }

    @Transactional(readOnly = true)
    public MonthlyResponse monthly(UUID userId, YearMonth from, YearMonth to, UUID providerId) {
        User user = accounts.require(userId);
        Range range = resolve(from, to, time.today(user));
        String providerClause = providerId == null ? "" : " and b.provider_id = :providerId";
        String sql = """
                with months as (
                  select cast(m as date) as month_start
                  from generate_series(cast(:rangeStart as timestamp), cast(:lastMonth as timestamp), interval '1 month') m
                ),
                billed as (
                  select cast(date_trunc('month', cast(b.due_date as timestamp)) as date) as month_start,
                         sum(b.amount) as total, count(*) as cnt
                  from bills b
                  where b.user_id = :userId and b.currency = :currency
                    and b.due_date between :rangeStart and :rangeEnd%1$s
                  group by 1
                ),
                paid as (
                  select cast(date_trunc('month', cast(b.paid_date as timestamp)) as date) as month_start,
                         sum(b.amount) as total, count(*) as cnt
                  from bills b
                  where b.user_id = :userId and b.currency = :currency and b.status = 'PAID'
                    and b.paid_date between :rangeStart and :rangeEnd%1$s
                  group by 1
                )
                select m.month_start,
                       coalesce(billed.total, 0) as billed_total, coalesce(billed.cnt, 0) as billed_count,
                       coalesce(paid.total, 0) as paid_total, coalesce(paid.cnt, 0) as paid_count
                from months m
                left join billed on billed.month_start = m.month_start
                left join paid on paid.month_start = m.month_start
                order by m.month_start
                """.formatted(providerClause);
        var spec = jdbc.sql(sql)
                .param("userId", userId)
                .param("currency", user.getCurrency())
                .param("rangeStart", range.start())
                .param("rangeEnd", range.end())
                .param("lastMonth", range.to().atDay(1));
        if (providerId != null) {
            spec = spec.param("providerId", providerId);
        }
        List<MonthTotals> months = new ArrayList<>();
        BigDecimal billedTotal = BigDecimal.ZERO;
        BigDecimal paidTotal = BigDecimal.ZERO;
        for (Object[] row : spec.query((rs, rowNum) -> new Object[] {
                rs.getObject("month_start", LocalDate.class), rs.getBigDecimal("billed_total"),
                rs.getLong("billed_count"), rs.getBigDecimal("paid_total"), rs.getLong("paid_count") }).list()) {
            BigDecimal billed = (BigDecimal) row[1];
            BigDecimal paid = (BigDecimal) row[3];
            billedTotal = billedTotal.add(billed);
            paidTotal = paidTotal.add(paid);
            months.add(new MonthTotals(YearMonth.from((LocalDate) row[0]), Money.format(billed), (Long) row[2],
                    Money.format(paid), (Long) row[4]));
        }
        return new MonthlyResponse(user.getCurrency(), range.from(), range.to(), providerId, months,
                Money.format(billedTotal), Money.format(paidTotal));
    }

    @Transactional(readOnly = true)
    public CategoryBreakdownResponse categories(UUID userId, YearMonth from, YearMonth to, UUID providerId) {
        User user = accounts.require(userId);
        Range range = resolve(from, to, time.today(user));
        String sql = """
                select c.id, c.name, sum(b.amount) as total, count(*) as cnt
                from bills b join categories c on c.id = b.category_id
                where b.user_id = :userId and b.currency = :currency
                  and b.due_date between :rangeStart and :rangeEnd%s
                group by c.id, c.name
                order by total desc, c.name
                """.formatted(providerId == null ? "" : " and b.provider_id = :providerId");
        var spec = jdbc.sql(sql)
                .param("userId", userId)
                .param("currency", user.getCurrency())
                .param("rangeStart", range.start())
                .param("rangeEnd", range.end());
        if (providerId != null) {
            spec = spec.param("providerId", providerId);
        }
        List<Object[]> rows = spec.query((rs, rowNum) -> new Object[] { rs.getObject("id", UUID.class),
                rs.getString("name"), rs.getBigDecimal("total"), rs.getLong("cnt") }).list();
        BigDecimal grand = rows.stream().map(r -> (BigDecimal) r[2]).reduce(BigDecimal.ZERO, BigDecimal::add);
        List<CategoryShare> shares = rows.stream().map(r -> {
            BigDecimal total = (BigDecimal) r[2];
            BigDecimal share = grand.signum() == 0 ? BigDecimal.ZERO
                    : total.multiply(BigDecimal.valueOf(100)).divide(grand, 1, RoundingMode.HALF_UP);
            return new CategoryShare((UUID) r[0], (String) r[1], Money.format(total), (Long) r[3],
                    share.toPlainString());
        }).toList();
        return new CategoryBreakdownResponse(user.getCurrency(), range.from(), range.to(), providerId,
                Money.format(grand), shares);
    }

    @Transactional(readOnly = true)
    public ProviderTrendResponse providerTrends(UUID userId, YearMonth from, YearMonth to, UUID providerId) {
        User user = accounts.require(userId);
        Range range = resolve(from, to, time.today(user));
        String sql = """
                select p.id, p.name,
                       cast(date_trunc('month', cast(b.due_date as timestamp)) as date) as month_start,
                       sum(b.amount) as total, count(*) as cnt
                from bills b join providers p on p.id = b.provider_id
                where b.user_id = :userId and b.currency = :currency
                  and b.due_date between :rangeStart and :rangeEnd%s
                group by p.id, p.name, month_start
                order by p.name, month_start
                """.formatted(providerId == null ? "" : " and b.provider_id = :providerId");
        var spec = jdbc.sql(sql)
                .param("userId", userId)
                .param("currency", user.getCurrency())
                .param("rangeStart", range.start())
                .param("rangeEnd", range.end());
        if (providerId != null) {
            spec = spec.param("providerId", providerId);
        }
        List<YearMonth> months = range.months();
        Map<UUID, String> names = new LinkedHashMap<>();
        Map<UUID, Map<YearMonth, BigDecimal>> byProvider = new HashMap<>();
        Map<UUID, Long> counts = new HashMap<>();
        spec.query((rs, rowNum) -> {
            UUID id = rs.getObject("id", UUID.class);
            names.putIfAbsent(id, rs.getString("name"));
            byProvider.computeIfAbsent(id, k -> new HashMap<>())
                    .put(YearMonth.from(rs.getObject("month_start", LocalDate.class)), rs.getBigDecimal("total"));
            counts.merge(id, rs.getLong("cnt"), Long::sum);
            return null;
        }).list();
        BigDecimal monthCount = BigDecimal.valueOf(months.size());
        List<ProviderSeries> series = new ArrayList<>();
        for (Map.Entry<UUID, String> provider : names.entrySet()) {
            Map<YearMonth, BigDecimal> values = byProvider.get(provider.getKey());
            BigDecimal total = values.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
            List<String> monthly = months.stream().map(m -> Money.format(values.getOrDefault(m, BigDecimal.ZERO)))
                    .toList();
            series.add(new ProviderSeries(provider.getKey(), provider.getValue(), Money.format(total),
                    Money.format(total.divide(monthCount, 2, RoundingMode.HALF_UP)),
                    counts.getOrDefault(provider.getKey(), 0L), monthly));
        }
        series.sort((a, b) -> new BigDecimal(b.total()).compareTo(new BigDecimal(a.total())));
        return new ProviderTrendResponse(user.getCurrency(), range.from(), range.to(), months, series);
    }

    /** Defaults to the 12 months ending with the current month (household timezone). */
    static Range resolve(YearMonth from, YearMonth to, LocalDate today) {
        YearMonth end = to != null ? to : YearMonth.from(today);
        YearMonth start = from != null ? from : end.minusMonths(11);
        if (start.isAfter(end)) {
            throw ApiException.badRequest("invalid_range", "The start month must be on or before the end month.");
        }
        if (start.plusMonths(MAX_MONTHS - 1).isBefore(end)) {
            throw ApiException.badRequest("invalid_range", "Choose a range of at most " + MAX_MONTHS + " months.");
        }
        return new Range(start, end);
    }

    private static Figure figure(BigDecimal total, long count) {
        return new Figure(Money.format(total), count);
    }

    record Range(YearMonth from, YearMonth to) {

        LocalDate start() {
            return from.atDay(1);
        }

        LocalDate end() {
            return to.atEndOfMonth();
        }

        List<YearMonth> months() {
            List<YearMonth> result = new ArrayList<>();
            for (YearMonth m = from; !m.isAfter(to); m = m.plusMonths(1)) {
                result.add(m);
            }
            return result;
        }
    }
}
