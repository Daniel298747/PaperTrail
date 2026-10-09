package com.papertrail.seed;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.Environment;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.PlatformTransactionManager;

import com.papertrail.account.UserRepository;
import com.papertrail.bill.BillRepository;
import com.papertrail.category.CategoryRepository;
import com.papertrail.category.CategoryService;
import com.papertrail.config.AppProperties;
import com.papertrail.document.DocumentService;
import com.papertrail.document.DocumentVersionRepository;
import com.papertrail.notification.ReminderService;
import com.papertrail.provider.ProviderRepository;
import com.papertrail.schedule.BillGenerationService;
import com.papertrail.schedule.ScheduleOccurrenceLedger;
import com.papertrail.schedule.ScheduleRepository;
import com.papertrail.support.IntegrationTest;

class DemoSeedTest extends IntegrationTest {

    @Autowired UserRepository users;
    @Autowired CategoryService categoryService;
    @Autowired CategoryRepository categories;
    @Autowired ProviderRepository providers;
    @Autowired ScheduleRepository schedules;
    @Autowired BillRepository bills;
    @Autowired ScheduleOccurrenceLedger ledger;
    @Autowired DocumentVersionRepository documents;
    @Autowired DocumentService documentService;
    @Autowired BillGenerationService generation;
    @Autowired ReminderService reminders;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired AppProperties properties;
    @Autowired Environment environment;
    @Autowired ConfigurableApplicationContext context;

    private long count(String sql, UUID userId, LocalDate today) {
        var spec = jdbc.sql(sql).param("u", userId);
        if (sql.contains(":today")) {
            spec = spec.param("today", today);
        }
        return spec.query(Long.class).single();
    }

    @Test
    void seedsARealisticHouseholdRelativeToTodayAndCanBeRerun() throws Exception {
        DemoDataSeeder seeder = new DemoDataSeeder(users, categoryService, categories, providers, schedules, bills,
                ledger, documents, documentService, storage, generation, reminders, passwordEncoder, jdbc,
                transactionManager, clock, properties, environment, context);

        seeder.seed();
        UUID userId = seeder.seed();

        LocalDate today = LocalDate.now(clock.withZone(ZoneId.of("Europe/Dublin")));
        assertThat(jdbc.sql("select count(*) from users where email = 'demo@papertrail.local'")
                .query(Long.class).single()).isEqualTo(1);
        assertThat(count("select count(*) from bills where user_id = :u and status = 'UNPAID' and due_date < :today",
                userId, today)).isGreaterThanOrEqualTo(2);
        assertThat(count("""
                select count(*) from bills where user_id = :u and status = 'UNPAID'
                and due_date between :today and cast(:today as date) + 30""", userId, today))
                .isGreaterThanOrEqualTo(5);
        assertThat(count("select count(*) from bills where user_id = :u and status = 'PAID' and due_date < :today",
                userId, today)).isGreaterThanOrEqualTo(60);
        assertThat(count("select count(*) from recurring_bill_schedules where user_id = :u", userId, today))
                .isEqualTo(9);
        assertThat(count("select count(*) from bill_document_versions where user_id = :u", userId, today))
                .isGreaterThanOrEqualTo(15);
        assertThat(count("""
                select count(*) from (select bill_id from bill_document_versions where user_id = :u
                group by bill_id having count(*) > 1) multi""", userId, today))
                .isGreaterThanOrEqualTo(2);
        assertThat(count("select count(*) from notifications where user_id = :u and read_at is null", userId, today))
                .isGreaterThanOrEqualTo(3);

        // The demo login works through the real API.
        login("demo@papertrail.local", properties.seed().demoPassword());
    }
}
