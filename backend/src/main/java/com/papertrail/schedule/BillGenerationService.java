package com.papertrail.schedule;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.papertrail.account.User;
import com.papertrail.account.UserRepository;
import com.papertrail.bill.Bill;
import com.papertrail.bill.BillRepository;
import com.papertrail.config.AppProperties;

/**
 * Turns active schedules into concrete bills due within the horizon (default 30 days).
 *
 * <p>Rules:
 * <ul>
 * <li>"Today" is evaluated in each household's own timezone.</li>
 * <li>Only cycles on or after max(start date, today, day after the last generated occurrence) are created,
 * so editing a schedule affects future bills only and never back-fills or rewrites existing ones.</li>
 * <li>Each cycle is claimed in the ledger with INSERT .. ON CONFLICT DO NOTHING inside the same transaction
 * as the bill insert. Repeated runs, overlapping runs, and multiple app instances cannot duplicate a bill.</li>
 * </ul>
 */
@Service
public class BillGenerationService {

    private static final Logger log = LoggerFactory.getLogger(BillGenerationService.class);

    private final ScheduleRepository schedules;
    private final ScheduleOccurrenceLedger ledger;
    private final BillRepository bills;
    private final UserRepository users;
    private final TransactionTemplate transactions;
    private final int horizonDays;

    public BillGenerationService(ScheduleRepository schedules, ScheduleOccurrenceLedger ledger, BillRepository bills,
            UserRepository users, PlatformTransactionManager transactionManager, AppProperties properties) {
        this.schedules = schedules;
        this.ledger = ledger;
        this.bills = bills;
        this.users = users;
        this.transactions = new TransactionTemplate(transactionManager);
        this.horizonDays = properties.jobs().horizonDays();
    }

    /** Runs every active schedule, each in its own transaction so one failure can't block the rest. */
    public GenerationReport generateAll(Instant now) {
        return generate(schedules.findActiveIds(), now);
    }

    public GenerationReport generateForUser(UUID userId, Instant now) {
        return generate(schedules.findActiveIdsByUser(userId), now);
    }

    private GenerationReport generate(List<UUID> scheduleIds, Instant now) {
        int created = 0;
        int failed = 0;
        for (UUID scheduleId : scheduleIds) {
            try {
                Integer count = transactions.execute(status -> generateWithinTransaction(scheduleId, now).size());
                created += count == null ? 0 : count;
            } catch (RuntimeException e) {
                failed++;
                log.error("Bill generation failed for schedule {}", scheduleId, e);
            }
        }
        return new GenerationReport(scheduleIds.size(), created, failed);
    }

    /** Joins the caller's transaction (used right after a schedule is created, edited or resumed). */
    public List<Bill> generateWithinTransaction(UUID scheduleId, Instant now) {
        Optional<RecurringBillSchedule> found = schedules.findWithReferencesById(scheduleId);
        if (found.isEmpty() || !found.get().isActive()) {
            return List.of();
        }
        RecurringBillSchedule schedule = found.get();
        User owner = users.findById(schedule.getUserId()).orElseThrow();
        ZoneId zone = owner.zoneId();
        LocalDate today = LocalDate.ofInstant(now, zone);
        LocalDate windowEnd = today.plusDays(horizonDays);

        LocalDate windowStart = later(schedule.getStartDate(), today);
        Optional<LocalDate> lastGenerated = ledger.lastOccurrenceDate(scheduleId);
        if (lastGenerated.isPresent()) {
            windowStart = later(windowStart, lastGenerated.get().plusDays(1));
        }

        List<Bill> generated = new ArrayList<>();
        for (LocalDate dueDate : schedule.rule().occurrencesBetween(windowStart, windowEnd)) {
            Optional<UUID> claimed = ledger.claim(scheduleId, dueDate);
            if (claimed.isEmpty()) {
                continue;
            }
            Bill bill = bills.saveAndFlush(Bill.fromSchedule(schedule, dueDate));
            ledger.attachBill(claimed.get(), bill.getId());
            generated.add(bill);
        }
        return generated;
    }

    private static LocalDate later(LocalDate a, LocalDate b) {
        return a.isAfter(b) ? a : b;
    }

    public record GenerationReport(int schedulesChecked, int billsCreated, int failures) {
    }
}
