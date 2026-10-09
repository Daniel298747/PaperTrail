package com.papertrail.analytics;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.papertrail.support.IntegrationTest;

class AnalyticsIntegrationTest extends IntegrationTest {

    @Test
    void outstandingAndOverdueUseExactDecimalArithmetic() throws Exception {
        Session session = register();
        String[] refs = providerAndCategory(session);
        LocalDate today = today(session);
        createBill(session, refs[0], refs[1], "0.10", today.plusDays(2));
        createBill(session, refs[0], refs[1], "0.20", today.minusDays(1));
        createBill(session, refs[0], refs[1], "1234567.89", today.plusDays(20));
        String paid = createBill(session, refs[0], refs[1], "999.99", today.minusDays(4));
        postAs(session, "/api/bills/{id}/payment", null, paid).andExpect(status().isOk());

        getAs(session, "/api/analytics/summary")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.currency").value("EUR"))
                .andExpect(jsonPath("$.rangeApplied").value(false))
                .andExpect(jsonPath("$.outstanding.total").value("1234568.19"))
                .andExpect(jsonPath("$.outstanding.count").value(3))
                .andExpect(jsonPath("$.overdue.total").value("0.20"))
                .andExpect(jsonPath("$.overdue.count").value(1))
                .andExpect(jsonPath("$.dueNext7Days.total").value("0.10"))
                // Without a range, "paid" covers the current month; the bill was paid today.
                .andExpect(jsonPath("$.paid.total").value("999.99"));
    }

    @Test
    void outstandingBalanceDropsAsSoonAsABillIsPaid() throws Exception {
        Session session = register();
        String[] refs = providerAndCategory(session);
        LocalDate today = today(session);
        createBill(session, refs[0], refs[1], "150.00", today.plusDays(3));
        String gas = createBill(session, refs[0], refs[1], "64.35", today.plusDays(6));

        getAs(session, "/api/analytics/summary").andExpect(jsonPath("$.outstanding.total").value("214.35"));
        postAs(session, "/api/bills/{id}/payment", null, gas).andExpect(status().isOk());
        getAs(session, "/api/analytics/summary")
                .andExpect(jsonPath("$.outstanding.total").value("150.00"))
                .andExpect(jsonPath("$.outstanding.count").value(1))
                .andExpect(jsonPath("$.paid.total").value("64.35"));
        deleteAs(session, "/api/bills/{id}/payment", gas).andExpect(status().isOk());
        getAs(session, "/api/analytics/summary").andExpect(jsonPath("$.outstanding.total").value("214.35"));
    }

    @Test
    void monthlyTotalsGroupBilledByDueDateAndPaidByPaymentDate() throws Exception {
        Session session = register();
        String[] refs = providerAndCategory(session);
        LocalDate today = today(session);
        YearMonth thisMonth = YearMonth.from(today);
        YearMonth lastMonth = thisMonth.minusMonths(1);
        YearMonth twoAgo = thisMonth.minusMonths(2);

        // Due two months ago, paid last month: billed in twoAgo, paid in lastMonth.
        String late = createBill(session, refs[0], refs[1], "100.00", twoAgo.atDay(10));
        postAs(session, "/api/bills/{id}/payment", Map.of("paidDate", lastMonth.atDay(3).toString()), late)
                .andExpect(status().isOk());
        // Due and paid last month.
        String onTime = createBill(session, refs[0], refs[1], "40.50", lastMonth.atDay(20));
        postAs(session, "/api/bills/{id}/payment", Map.of("paidDate", lastMonth.atDay(18).toString()), onTime)
                .andExpect(status().isOk());
        // Unpaid, due this month.
        createBill(session, refs[0], refs[1], "12.25", thisMonth.atDay(1));

        getAs(session, "/api/analytics/monthly?from={f}&to={t}", twoAgo, thisMonth)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.months", hasSize(3)))
                .andExpect(jsonPath("$.months[*].month", contains(twoAgo.toString(), lastMonth.toString(),
                        thisMonth.toString())))
                .andExpect(jsonPath("$.months[*].billed", contains("100.00", "40.50", "12.25")))
                .andExpect(jsonPath("$.months[*].paid", contains("0.00", "140.50", "0.00")))
                .andExpect(jsonPath("$.billedTotal").value("152.75"))
                .andExpect(jsonPath("$.paidTotal").value("140.50"));

        getAs(session, "/api/analytics/summary?from={f}&to={t}", twoAgo, lastMonth)
                .andExpect(jsonPath("$.rangeApplied").value(true))
                .andExpect(jsonPath("$.billed.total").value("140.50"))
                .andExpect(jsonPath("$.paid.total").value("140.50"))
                .andExpect(jsonPath("$.outstanding.total").value("0.00"));

        getAs(session, "/api/analytics/monthly?from={f}&to={t}", thisMonth, twoAgo)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_range"));
    }

    @Test
    void categoryBreakdownAndProviderTrendsWithProviderFilter() throws Exception {
        Session session = register();
        String energy = createProvider(session, "Lumenfield Energy");
        String gasCo = createProvider(session, "Northgate Gas");
        String electricity = categoryId(session, "Electricity");
        String gas = categoryId(session, "Gas");
        LocalDate today = today(session);
        YearMonth thisMonth = YearMonth.from(today);
        YearMonth lastMonth = thisMonth.minusMonths(1);

        createBill(session, energy, electricity, "75.00", lastMonth.atDay(5));
        createBill(session, energy, electricity, "25.00", thisMonth.atDay(5));
        createBill(session, gasCo, gas, "300.00", lastMonth.atDay(12));

        getAs(session, "/api/analytics/categories?from={f}&to={t}", lastMonth, thisMonth)
                .andExpect(jsonPath("$.total").value("400.00"))
                .andExpect(jsonPath("$.categories[*].name", contains("Gas", "Electricity")))
                .andExpect(jsonPath("$.categories[*].total", contains("300.00", "100.00")))
                .andExpect(jsonPath("$.categories[*].sharePercent", contains("75.0", "25.0")));

        getAs(session, "/api/analytics/providers?from={f}&to={t}", lastMonth, thisMonth)
                .andExpect(jsonPath("$.months", contains(lastMonth.toString(), thisMonth.toString())))
                .andExpect(jsonPath("$.providers[*].name", contains("Northgate Gas", "Lumenfield Energy")))
                .andExpect(jsonPath("$.providers[0].values", contains("300.00", "0.00")))
                .andExpect(jsonPath("$.providers[1].values", contains("75.00", "25.00")))
                .andExpect(jsonPath("$.providers[1].averagePerMonth").value("50.00"))
                .andExpect(jsonPath("$.providers[1].billCount").value(2));

        getAs(session, "/api/analytics/providers?from={f}&to={t}&providerId={p}", lastMonth, thisMonth, energy)
                .andExpect(jsonPath("$.providers", hasSize(1)))
                .andExpect(jsonPath("$.providers[0].total").value("100.00"));
        getAs(session, "/api/analytics/summary?providerId={p}", gasCo)
                .andExpect(jsonPath("$.outstanding.total").value("300.00"));
    }

    @Test
    void totalsNeverMixCurrencies() throws Exception {
        Session session = register();
        String[] refs = providerAndCategory(session);
        LocalDate today = today(session);
        createBill(session, refs[0], refs[1], "10.00", today.plusDays(1));
        // A row in another currency (e.g. legacy import) must never be added to EUR totals.
        jdbc.sql("""
                insert into bills (id, user_id, title, provider_id, category_id, amount, currency, due_date)
                values (:id, :userId, 'Imported USD bill', :providerId, :categoryId, 500.00, 'USD', :due)""")
                .param("id", UUID.randomUUID())
                .param("userId", UUID.fromString(session.userId()))
                .param("providerId", UUID.fromString(refs[0]))
                .param("categoryId", UUID.fromString(refs[1]))
                .param("due", today.plusDays(1))
                .update();

        getAs(session, "/api/analytics/summary")
                .andExpect(jsonPath("$.currency").value("EUR"))
                .andExpect(jsonPath("$.outstanding.total").value("10.00"))
                .andExpect(jsonPath("$.outstanding.count").value(1));
    }
}
