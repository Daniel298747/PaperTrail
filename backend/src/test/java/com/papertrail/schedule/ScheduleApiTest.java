package com.papertrail.schedule;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.papertrail.support.IntegrationTest;

class ScheduleApiTest extends IntegrationTest {

    @Test
    void createListPreviewPauseResumeAndDelete() throws Exception {
        clock.set(Instant.parse("2026-01-20T10:00:00Z"));
        Session session = register();
        String[] refs = providerAndCategory(session);

        postAs(session, "/api/schedules/preview", Map.of("startDate", "2026-01-01", "billingDay", 31,
                "frequency", "MONTHLY", "count", 4))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dates", contains("2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30")));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", "Rent");
        body.put("providerId", refs[0]);
        body.put("categoryId", refs[1]);
        body.put("amount", "1650");
        body.put("frequency", "MONTHLY");
        body.put("startDate", "2026-01-01");
        body.put("billingDay", 31);
        body.put("reminderLeadDays", 5);
        String id = read(postAs(session, "/api/schedules", body)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.schedule.amount").value("1650.00"))
                .andExpect(jsonPath("$.schedule.active").value(true))
                .andExpect(jsonPath("$.schedule.upcoming", contains("2026-01-31", "2026-02-28", "2026-03-31",
                        "2026-04-30")))
                .andExpect(jsonPath("$.schedule.generatedCount").value(1))
                .andExpect(jsonPath("$.schedule.lastGenerated").value("2026-01-31"))
                .andExpect(jsonPath("$.recentBills", hasSize(1)))
                .andExpect(jsonPath("$.recentBills[0].schedule.name").value("Rent"))
                .andExpect(jsonPath("$.recentBills[0].reminderLeadDays").doesNotExist()), "$.schedule.id");

        getAs(session, "/api/schedules").andExpect(jsonPath("$", hasSize(1)));
        postAs(session, "/api/schedules/{id}/pause", null, id).andExpect(jsonPath("$.schedule.active").value(false));
        postAs(session, "/api/schedules/{id}/resume", null, id).andExpect(jsonPath("$.schedule.active").value(true));

        String billId = read(getAs(session, "/api/schedules/{id}", id), "$.recentBills[0].id");
        deleteAs(session, "/api/schedules/{id}", id).andExpect(status().isNoContent());
        getAs(session, "/api/schedules/{id}", id).andExpect(status().isNotFound());
        // Generated bills outlive their schedule; only the link is cleared.
        getAs(session, "/api/bills/{id}", billId).andExpect(status().isOk())
                .andExpect(jsonPath("$.schedule").doesNotExist());
    }

    @Test
    void validatesScheduleInput() throws Exception {
        Session session = register();
        String[] refs = providerAndCategory(session);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", "Bad");
        body.put("providerId", refs[0]);
        body.put("categoryId", refs[1]);
        body.put("amount", "10.00");
        body.put("frequency", "MONTHLY");
        body.put("startDate", "2026-01-01");
        body.put("billingDay", 32);
        body.put("reminderLeadDays", 3);
        postAs(session, "/api/schedules", body).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("billingDay"));
        body.put("billingDay", 1);
        body.put("frequency", "WEEKLY");
        postAs(session, "/api/schedules", body).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("malformed_request"));
    }
}
