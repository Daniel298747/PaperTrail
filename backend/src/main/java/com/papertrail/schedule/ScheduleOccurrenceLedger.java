package com.papertrail.schedule;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * The generation ledger (table schedule_occurrences). The unique key (schedule_id, cycle_month) is what
 * makes generation idempotent: concurrent or repeated job runs race on the same insert, and exactly one wins.
 */
@Repository
public class ScheduleOccurrenceLedger {

    private final JdbcClient jdbc;

    public ScheduleOccurrenceLedger(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Claims a billing cycle. Empty when the cycle was already claimed (now or by an earlier run). */
    public Optional<UUID> claim(UUID scheduleId, LocalDate occurrenceDate) {
        return jdbc.sql("""
                insert into schedule_occurrences (schedule_id, cycle_month, occurrence_date)
                values (:scheduleId, :cycleMonth, :occurrenceDate)
                on conflict (schedule_id, cycle_month) do nothing
                returning id""")
                .param("scheduleId", scheduleId)
                .param("cycleMonth", occurrenceDate.withDayOfMonth(1))
                .param("occurrenceDate", occurrenceDate)
                .query(UUID.class)
                .optional();
    }

    public void attachBill(UUID occurrenceId, UUID billId) {
        jdbc.sql("update schedule_occurrences set bill_id = :billId where id = :id")
                .param("billId", billId)
                .param("id", occurrenceId)
                .update();
    }

    public Optional<LocalDate> lastOccurrenceDate(UUID scheduleId) {
        return jdbc.sql("select max(occurrence_date) from schedule_occurrences where schedule_id = :scheduleId")
                .param("scheduleId", scheduleId)
                .query(LocalDate.class)
                .optional();
    }

    public long count(UUID scheduleId) {
        return jdbc.sql("select count(*) from schedule_occurrences where schedule_id = :scheduleId")
                .param("scheduleId", scheduleId)
                .query(Long.class)
                .single();
    }
}
