package com.papertrail.jobs;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

import com.papertrail.auth.RefreshTokenService;
import com.papertrail.config.AppProperties;
import com.papertrail.notification.ReminderService;
import com.papertrail.schedule.BillGenerationService;

/**
 * Generates upcoming recurring bills, then issues reminders. Runs on a cron (every 15 minutes by default,
 * so each household's midnight is picked up promptly whatever its timezone) and once at startup to catch up.
 * Safe to run concurrently on several instances: both steps are idempotent at the database level.
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "app.jobs", name = "enabled", havingValue = "true", matchIfMissing = true)
public class RecurringBillJob {

    private static final Logger log = LoggerFactory.getLogger(RecurringBillJob.class);

    private final BillGenerationService generation;
    private final ReminderService reminders;
    private final RefreshTokenService refreshTokens;
    private final Clock clock;
    private final AppProperties properties;

    public RecurringBillJob(BillGenerationService generation, ReminderService reminders,
            RefreshTokenService refreshTokens, Clock clock, AppProperties properties) {
        this.generation = generation;
        this.reminders = reminders;
        this.refreshTokens = refreshTokens;
        this.clock = clock;
        this.properties = properties;
    }

    @Scheduled(cron = "${app.jobs.cron}", zone = "UTC")
    public void runScheduled() {
        runOnce();
    }

    @EventListener(ApplicationReadyEvent.class)
    @Order(20)
    public void runAtStartup() {
        if (properties.jobs().runOnStartup()) {
            runOnce();
        }
    }

    public void runOnce() {
        Instant now = clock.instant();
        try {
            BillGenerationService.GenerationReport report = generation.generateAll(now);
            int created = reminders.createReminders(now);
            log.info("Recurring job: {} schedules checked, {} bills generated, {} failures, {} reminders created",
                    report.schedulesChecked(), report.billsCreated(), report.failures(), created);
        } catch (RuntimeException e) {
            log.error("Recurring bill job failed", e);
        }
    }

    @Scheduled(cron = "0 30 3 * * *", zone = "UTC")
    public void purgeExpiredSessions() {
        int removed = refreshTokens.purgeExpired(clock.instant().minus(Duration.ofDays(7)));
        if (removed > 0) {
            log.info("Removed {} expired refresh tokens", removed);
        }
    }
}
