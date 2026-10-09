package com.papertrail.notification;

import java.text.NumberFormat;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.Currency;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.papertrail.account.User;
import com.papertrail.account.UserRepository;
import com.papertrail.bill.Bill;
import com.papertrail.bill.BillRepository;

/**
 * Creates due-soon and overdue reminders.
 *
 * <ul>
 * <li>Due soon: an unpaid bill whose due date is within its reminder lead time of today (household timezone).</li>
 * <li>Overdue: an unpaid bill whose due date has passed (sent for bills overdue by up to a week, so a
 * long-forgotten bill doesn't trigger a burst after setup).</li>
 * <li>Only UNPAID bills are candidates, so paid bills never receive upcoming-due reminders.</li>
 * <li>INSERT .. ON CONFLICT on (bill_id, type, reference_date) makes reruns harmless.</li>
 * </ul>
 */
@Service
public class ReminderService {

    static final int MAX_LEAD_DAYS = 60;
    static final int OVERDUE_LOOKBACK_DAYS = 7;
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("EEE d MMM yyyy", Locale.ENGLISH);

    private final BillRepository bills;
    private final UserRepository users;
    private final JdbcClient jdbc;

    public ReminderService(BillRepository bills, UserRepository users, JdbcClient jdbc) {
        this.bills = bills;
        this.users = users;
        this.jdbc = jdbc;
    }

    @Transactional
    public int createReminders(Instant now) {
        return createReminders(now, null);
    }

    /** @param onlyUserId restricts the run to one household (used by the demo seeder); null for all. */
    @Transactional
    public int createReminders(Instant now, UUID onlyUserId) {
        // Widen the UTC window by a day each side; the exact test happens per household below.
        LocalDate utcToday = LocalDate.ofInstant(now, ZoneOffset.UTC);
        List<Bill> candidates = bills.findUnpaidDueBetween(utcToday.minusDays(OVERDUE_LOOKBACK_DAYS + 1),
                utcToday.plusDays(MAX_LEAD_DAYS + 1));
        Map<UUID, Optional<User>> owners = new HashMap<>();
        int created = 0;
        for (Bill bill : candidates) {
            if (onlyUserId != null && !onlyUserId.equals(bill.getUserId())) {
                continue;
            }
            Optional<User> owner = owners.computeIfAbsent(bill.getUserId(), users::findById);
            if (owner.isEmpty()) {
                continue;
            }
            LocalDate today = LocalDate.ofInstant(now, owner.get().zoneId());
            long daysUntilDue = ChronoUnit.DAYS.between(today, bill.getDueDate());
            if (daysUntilDue < 0 && daysUntilDue >= -OVERDUE_LOOKBACK_DAYS) {
                created += insert(bill, NotificationType.BILL_OVERDUE, now,
                        bill.getProvider().getName() + " bill is overdue",
                        formatAmount(bill) + " for " + bill.getTitle() + " was due " + DATE.format(bill.getDueDate())
                                + ". Mark it paid once settled.");
            } else if (daysUntilDue >= 0 && daysUntilDue <= bill.getReminderLeadDays()) {
                created += insert(bill, NotificationType.BILL_DUE_SOON, now,
                        bill.getProvider().getName() + " bill due " + relative(daysUntilDue),
                        formatAmount(bill) + " for " + bill.getTitle() + " is due " + DATE.format(bill.getDueDate())
                                + ".");
            }
        }
        return created;
    }

    private int insert(Bill bill, NotificationType type, Instant now, String title, String body) {
        return jdbc.sql("""
                insert into notifications (id, user_id, bill_id, type, reference_date, title, body, created_at)
                values (gen_random_uuid(), :userId, :billId, :type, :referenceDate, :title, :body, :createdAt)
                on conflict (bill_id, type, reference_date) do nothing""")
                .param("userId", bill.getUserId())
                .param("billId", bill.getId())
                .param("type", type.name())
                .param("referenceDate", bill.getDueDate())
                .param("title", truncate(title, 200))
                .param("body", truncate(body, 500))
                .param("createdAt", OffsetDateTime.ofInstant(now, ZoneOffset.UTC))
                .update();
    }

    private static String relative(long days) {
        if (days == 0) {
            return "today";
        }
        return days == 1 ? "tomorrow" : "in " + days + " days";
    }

    private static String formatAmount(Bill bill) {
        NumberFormat format = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("en-IE"));
        format.setCurrency(Currency.getInstance(bill.getCurrency()));
        return format.format(bill.getAmount());
    }

    private static String truncate(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max - 1) + "…";
    }
}
