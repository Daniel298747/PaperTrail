package com.papertrail.schedule;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import com.papertrail.support.IntegrationTest;

class RecurringGenerationTest extends IntegrationTest {

    @Autowired
    private BillGenerationService generation;

    private Map<String, Object> scheduleBody(String providerId, String categoryId, String amount, String start,
            int billingDay, String frequency, boolean active) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", "Recurring " + billingDay);
        body.put("providerId", providerId);
        body.put("categoryId", categoryId);
        body.put("amount", amount);
        body.put("frequency", frequency);
        body.put("startDate", start);
        body.put("billingDay", billingDay);
        body.put("reminderLeadDays", 3);
        body.put("active", active);
        return body;
    }

    private String createSchedule(Session session, Map<String, Object> body) throws Exception {
        return read(postAs(session, "/api/schedules", body).andExpect(status().isCreated()), "$.schedule.id");
    }

    private List<LocalDate> dueDates(String scheduleId) {
        return jdbc.sql("select due_date from bills where schedule_id = :id order by due_date")
                .param("id", UUID.fromString(scheduleId)).query(LocalDate.class).list();
    }

    private void activate(String scheduleId) {
        jdbc.sql("update recurring_bill_schedules set active = true where id = :id")
                .param("id", UUID.fromString(scheduleId)).update();
    }

    @Test
    void repeatedRunsAreIdempotent() throws Exception {
        Instant now = Instant.parse("2026-04-10T09:00:00Z");
        clock.set(now);
        Session session = register();
        String[] refs = providerAndCategory(session);
        String id = createSchedule(session, scheduleBody(refs[0], refs[1], "50.00", "2026-01-01", 10, "MONTHLY", false));
        activate(id);

        UUID userId = UUID.fromString(session.userId());
        assertThat(generation.generateForUser(userId, now).billsCreated()).isEqualTo(2);
        assertThat(generation.generateForUser(userId, now).billsCreated()).isZero();
        assertThat(generation.generateForUser(userId, now.plusSeconds(3600)).billsCreated()).isZero();
        // Window [10 Apr, 10 May]: both ends are inclusive.
        assertThat(dueDates(id)).containsExactly(LocalDate.parse("2026-04-10"), LocalDate.parse("2026-05-10"));
    }

    @Test
    void concurrentRunsNeverCreateDuplicates() throws Exception {
        Instant now = Instant.parse("2026-04-10T09:00:00Z");
        clock.set(now);
        Session session = register();
        String[] refs = providerAndCategory(session);
        List<String> ids = new ArrayList<>();
        for (int day : new int[] { 10, 15, 28 }) {
            String id = createSchedule(session, scheduleBody(refs[0], refs[1], "20.00", "2026-01-01", day, "MONTHLY",
                    false));
            activate(id);
            ids.add(id);
        }

        UUID userId = UUID.fromString(session.userId());
        ExecutorService pool = Executors.newFixedThreadPool(8);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<BillGenerationService.GenerationReport>> results = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            results.add(pool.submit(() -> {
                start.await();
                return generation.generateForUser(userId, now);
            }));
        }
        start.countDown();
        int created = 0;
        for (Future<BillGenerationService.GenerationReport> result : results) {
            BillGenerationService.GenerationReport report = result.get(60, TimeUnit.SECONDS);
            assertThat(report.failures()).isZero();
            created += report.billsCreated();
        }
        pool.shutdown();

        assertThat(dueDates(ids.get(0))).containsExactly(LocalDate.parse("2026-04-10"), LocalDate.parse("2026-05-10"));
        assertThat(dueDates(ids.get(1))).containsExactly(LocalDate.parse("2026-04-15"));
        assertThat(dueDates(ids.get(2))).containsExactly(LocalDate.parse("2026-04-28"));
        assertThat(created).isEqualTo(4);
        Long ledgerRows = jdbc.sql("select count(*) from schedule_occurrences o join recurring_bill_schedules s "
                + "on s.id = o.schedule_id where s.user_id = :u").param("u", userId).query(Long.class).single();
        assertThat(ledgerRows).isEqualTo(4);
    }

    @Test
    void theJobPathAlsoCoversEveryActiveSchedule() throws Exception {
        Instant now = Instant.parse("2026-04-10T09:00:00Z");
        clock.set(now);
        Session session = register();
        String[] refs = providerAndCategory(session);
        String id = createSchedule(session, scheduleBody(refs[0], refs[1], "20.00", "2026-01-01", 12, "MONTHLY", false));
        activate(id);

        generation.generateAll(now);
        generation.generateAll(now);
        assertThat(dueDates(id)).containsExactly(LocalDate.parse("2026-04-12"));
    }

    @Test
    void todayIsEvaluatedInEachHouseholdsTimezone() throws Exception {
        // 12:00 UTC on 28 Feb is already 1 March in Auckland but still 28 February in Los Angeles.
        Instant now = Instant.parse("2026-02-28T12:00:00Z");
        clock.set(now);
        Session auckland = register("Pacific/Auckland");
        Session losAngeles = register("America/Los_Angeles");
        String[] a = providerAndCategory(auckland);
        String[] la = providerAndCategory(losAngeles);
        String aucklandSchedule = createSchedule(auckland, scheduleBody(a[0], a[1], "10.00", "2026-01-01", 31,
                "MONTHLY", false));
        String laSchedule = createSchedule(losAngeles, scheduleBody(la[0], la[1], "10.00", "2026-01-01", 31,
                "MONTHLY", false));
        activate(aucklandSchedule);
        activate(laSchedule);

        generation.generateForUser(UUID.fromString(auckland.userId()), now);
        generation.generateForUser(UUID.fromString(losAngeles.userId()), now);

        assertThat(dueDates(aucklandSchedule)).containsExactly(LocalDate.parse("2026-03-31"));
        assertThat(dueDates(laSchedule)).containsExactly(LocalDate.parse("2026-02-28"));
    }

    @Test
    void onlyInstancesInsideTheThirtyDayHorizonAreGenerated() throws Exception {
        Instant now = Instant.parse("2026-06-01T12:00:00Z");
        clock.set(now);
        Session session = register();
        String[] refs = providerAndCategory(session);
        String inside = createSchedule(session, scheduleBody(refs[0], refs[1], "10.00", "2026-06-02", 1, "MONTHLY", true));
        String outside = createSchedule(session, scheduleBody(refs[0], refs[1], "10.00", "2026-06-03", 2, "MONTHLY", true));

        assertThat(dueDates(inside)).containsExactly(LocalDate.parse("2026-07-01"));
        assertThat(dueDates(outside)).isEmpty();
        generation.generateForUser(UUID.fromString(session.userId()), now.plusSeconds(86_400));
        assertThat(dueDates(outside)).containsExactly(LocalDate.parse("2026-07-02"));
    }

    @Test
    void monthEndAnchorSurvivesFebruaryThroughRealRuns() throws Exception {
        clock.set(Instant.parse("2027-12-20T10:00:00Z"));
        Session session = register();
        String[] refs = providerAndCategory(session);
        String id = createSchedule(session, scheduleBody(refs[0], refs[1], "31.00", "2027-12-01", 31, "MONTHLY", true));
        UUID userId = UUID.fromString(session.userId());
        for (String run : List.of("2028-01-20T10:00:00Z", "2028-02-20T10:00:00Z", "2028-03-20T10:00:00Z",
                "2028-04-20T10:00:00Z")) {
            generation.generateForUser(userId, Instant.parse(run));
        }
        // The last run (20 April) has a window ending 20 May, so 31 May is not generated yet.
        assertThat(dueDates(id)).containsExactly(LocalDate.parse("2027-12-31"), LocalDate.parse("2028-01-31"),
                LocalDate.parse("2028-02-29"), LocalDate.parse("2028-03-31"), LocalDate.parse("2028-04-30"));
    }

    @Test
    void editsAffectFutureInstancesOnlyAndNeverDuplicateACycle() throws Exception {
        Instant may10 = Instant.parse("2026-05-10T09:00:00Z");
        clock.set(may10);
        Session session = register();
        String[] refs = providerAndCategory(session);
        Map<String, Object> body = scheduleBody(refs[0], refs[1], "50.00", "2026-05-01", 15, "MONTHLY", true);
        String id = createSchedule(session, body);
        assertThat(dueDates(id)).containsExactly(LocalDate.parse("2026-05-15"));

        body.put("amount", "65.00");
        body.put("billingDay", 20);
        putAs(session, "/api/schedules/{id}", body, id).andExpect(status().isOk())
                .andExpect(jsonPath("$.schedule.amount").value("65.00"));

        // May was already generated; moving the billing day must not add a second May bill.
        assertThat(dueDates(id)).containsExactly(LocalDate.parse("2026-05-15"));
        BigDecimal mayAmount = jdbc.sql("select amount from bills where schedule_id = :id")
                .param("id", UUID.fromString(id)).query(BigDecimal.class).single();
        assertThat(mayAmount).isEqualByComparingTo("50.00");

        generation.generateForUser(UUID.fromString(session.userId()), Instant.parse("2026-06-01T09:00:00Z"));
        assertThat(dueDates(id)).containsExactly(LocalDate.parse("2026-05-15"), LocalDate.parse("2026-06-20"));
        BigDecimal juneAmount = jdbc.sql("select amount from bills where schedule_id = :id and due_date = '2026-06-20'")
                .param("id", UUID.fromString(id)).query(BigDecimal.class).single();
        assertThat(juneAmount).isEqualByComparingTo("65.00");
    }

    @Test
    void deletedInstancesAreNotRecreatedAndPausedSchedulesGenerateNothing() throws Exception {
        Instant now = Instant.parse("2026-05-10T09:00:00Z");
        clock.set(now);
        Session session = register();
        String[] refs = providerAndCategory(session);
        String id = createSchedule(session, scheduleBody(refs[0], refs[1], "50.00", "2026-05-01", 15, "MONTHLY", true));
        String billId = jdbc.sql("select id from bills where schedule_id = :id").param("id", UUID.fromString(id))
                .query(UUID.class).single().toString();

        deleteAs(session, "/api/bills/{id}", billId).andExpect(status().isNoContent());
        generation.generateForUser(UUID.fromString(session.userId()), now);
        assertThat(dueDates(id)).isEmpty();

        postAs(session, "/api/schedules/{id}/pause", null, id).andExpect(status().isOk())
                .andExpect(jsonPath("$.schedule.active").value(false));
        generation.generateForUser(UUID.fromString(session.userId()), Instant.parse("2026-06-01T09:00:00Z"));
        assertThat(dueDates(id)).isEmpty();
    }
}
