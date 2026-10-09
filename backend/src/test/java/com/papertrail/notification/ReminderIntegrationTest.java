package com.papertrail.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import com.papertrail.support.IntegrationTest;

class ReminderIntegrationTest extends IntegrationTest {

    @Autowired
    private ReminderService reminders;

    private List<String> types(String userId) {
        return jdbc.sql("select type || ':' || reference_date from notifications where user_id = :u order by created_at, type")
                .param("u", UUID.fromString(userId)).query(String.class).list();
    }

    @Test
    void remindersRespectLeadTimeSkipPaidBillsAndNeverDuplicate() throws Exception {
        Instant march10 = Instant.parse("2026-03-10T08:00:00Z");
        clock.set(march10);
        Session session = register();
        UUID userId = UUID.fromString(session.userId());
        String[] refs = providerAndCategory(session);

        String dueSoon = createBill(session, refs[0], refs[1], "20.00", LocalDate.parse("2026-03-12"));
        String later = createBill(session, refs[0], refs[1], "30.00", LocalDate.parse("2026-03-20"));
        String paid = createBill(session, refs[0], refs[1], "40.00", LocalDate.parse("2026-03-11"));
        postAs(session, "/api/bills/{id}/payment", null, paid).andExpect(status().isOk());
        String overdue = createBill(session, refs[0], refs[1], "50.00", LocalDate.parse("2026-03-09"));

        assertThat(reminders.createReminders(march10, userId)).isEqualTo(2);
        assertThat(reminders.createReminders(march10, userId)).isZero();
        assertThat(reminders.createReminders(march10.plus(Duration.ofHours(6)), userId)).isZero();
        assertThat(types(session.userId())).containsExactlyInAnyOrder("BILL_DUE_SOON:2026-03-12",
                "BILL_OVERDUE:2026-03-09");

        // A week later: "later" enters its 3-day window and "dueSoon" has become overdue.
        Instant march17 = Instant.parse("2026-03-17T08:00:00Z");
        assertThat(reminders.createReminders(march17, userId)).isEqualTo(2);
        assertThat(types(session.userId())).hasSize(4).contains("BILL_DUE_SOON:2026-03-20", "BILL_OVERDUE:2026-03-12");
        assertThat(jdbc.sql("select count(*) from notifications where bill_id = :b")
                .param("b", UUID.fromString(paid)).query(Long.class).single()).isZero();

        clock.set(march17);
        Session fresh = login(session.email(), PASSWORD);
        getAs(fresh, "/api/notifications/unread-count").andExpect(jsonPath("$.count").value(4));
        String first = read(getAs(fresh, "/api/notifications")
                .andExpect(jsonPath("$.content", hasSize(4)))
                .andExpect(jsonPath("$.content[0].bill.id").exists()), "$.content[0].id");
        postAs(fresh, "/api/notifications/{id}/read", null, first).andExpect(status().isNoContent());
        getAs(fresh, "/api/notifications/unread-count").andExpect(jsonPath("$.count").value(3));
        getAs(fresh, "/api/notifications?unreadOnly=true").andExpect(jsonPath("$.content", hasSize(3)));
        postAs(fresh, "/api/notifications/read-all", null).andExpect(jsonPath("$.updated").value(3));
        getAs(fresh, "/api/notifications/unread-count").andExpect(jsonPath("$.count").value(0));

        // Paying a bill is reflected on its existing reminder.
        postAs(fresh, "/api/bills/{id}/payment", null, later).andExpect(status().isOk());
        getAs(fresh, "/api/notifications").andExpect(
                jsonPath("$.content[?(@.bill.id == '" + later + "')].bill.status").value("PAID"));
        // The overdue bill (9 March) is past the 7-day overdue window and is never re-notified.
        assertThat(types(session.userId())).filteredOn(t -> t.endsWith("2026-03-09")).hasSize(1);
        assertThat(overdue).isNotBlank();
    }

    @Test
    void movingTheDueDateAllowsAFreshReminder() throws Exception {
        Instant now = Instant.parse("2026-03-10T08:00:00Z");
        clock.set(now);
        Session session = register();
        UUID userId = UUID.fromString(session.userId());
        String[] refs = providerAndCategory(session);
        String id = createBill(session, refs[0], refs[1], "20.00", LocalDate.parse("2026-03-11"));
        reminders.createReminders(now, userId);

        Map<String, Object> moved = billBody("Moved", refs[0], refs[1], "20.00", LocalDate.parse("2026-03-12"));
        putAs(session, "/api/bills/{id}", moved, id).andExpect(status().isOk());
        reminders.createReminders(now, userId);
        reminders.createReminders(now, userId);

        assertThat(types(session.userId())).containsExactlyInAnyOrder("BILL_DUE_SOON:2026-03-11",
                "BILL_DUE_SOON:2026-03-12");
    }

    @Test
    void notificationsAreScopedToTheirHousehold() throws Exception {
        Instant now = Instant.parse("2026-03-10T08:00:00Z");
        clock.set(now);
        Session owner = register();
        Session other = register();
        String[] refs = providerAndCategory(owner);
        createBill(owner, refs[0], refs[1], "20.00", LocalDate.parse("2026-03-11"));
        reminders.createReminders(now, UUID.fromString(owner.userId()));
        String notificationId = read(getAs(owner, "/api/notifications"), "$.content[0].id");

        getAs(other, "/api/notifications").andExpect(jsonPath("$.totalElements").value(0));
        postAs(other, "/api/notifications/{id}/read", null, notificationId).andExpect(status().isNotFound());
        getAs(owner, "/api/notifications/unread-count").andExpect(jsonPath("$.count").value(1));
    }
}
