package com.papertrail.security;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.papertrail.support.IntegrationTest;

/** Every resource operation is scoped to the authenticated household; foreign ids behave like missing ids. */
class OwnershipIsolationTest extends IntegrationTest {

    @Test
    void anotherHouseholdCannotSeeOrChangeAnything() throws Exception {
        Session owner = register();
        Session intruder = register();

        String providerId = createProvider(owner, "Quayside Lettings");
        String categoryId = categoryId(owner, "Rent");
        String billId = createBill(owner, providerId, categoryId, "1650.00", today(owner));
        String documentId = read(upload(owner, billId, "rent.pdf", "application/pdf", PDF_BYTES)
                .andExpect(status().isCreated()), "$.id");
        Map<String, Object> schedule = new LinkedHashMap<>();
        schedule.put("title", "Rent");
        schedule.put("providerId", providerId);
        schedule.put("categoryId", categoryId);
        schedule.put("amount", "1650.00");
        schedule.put("frequency", "MONTHLY");
        schedule.put("startDate", today(owner).toString());
        schedule.put("billingDay", 1);
        schedule.put("reminderLeadDays", 3);
        String scheduleId = read(postAs(owner, "/api/schedules", schedule).andExpect(status().isCreated()),
                "$.schedule.id");

        // Bills
        getAs(intruder, "/api/bills/{id}", billId).andExpect(status().isNotFound());
        putAs(intruder, "/api/bills/{id}", billBody("Mine now", providerId, categoryId, "1.00", today(owner)), billId)
                .andExpect(status().isNotFound());
        postAs(intruder, "/api/bills/{id}/payment", null, billId).andExpect(status().isNotFound());
        deleteAs(intruder, "/api/bills/{id}/payment", billId).andExpect(status().isNotFound());
        deleteAs(intruder, "/api/bills/{id}", billId).andExpect(status().isNotFound());
        getAs(intruder, "/api/bills").andExpect(jsonPath("$.totalElements").value(0));

        // Documents
        getAs(intruder, "/api/bills/{id}/documents", billId).andExpect(status().isNotFound());
        upload(intruder, billId, "evil.pdf", "application/pdf", PDF_BYTES).andExpect(status().isNotFound());
        getAs(intruder, "/api/documents/{id}/link", documentId).andExpect(status().isNotFound());
        getAs(intruder, "/api/documents").andExpect(jsonPath("$.totalElements").value(0));

        // Reference data
        putAs(intruder, "/api/providers/{id}", Map.of("name", "Renamed"), providerId).andExpect(status().isNotFound());
        deleteAs(intruder, "/api/providers/{id}", providerId).andExpect(status().isNotFound());
        putAs(intruder, "/api/categories/{id}", Map.of("name", "Renamed"), categoryId).andExpect(status().isNotFound());
        deleteAs(intruder, "/api/categories/{id}", categoryId).andExpect(status().isNotFound());
        getAs(intruder, "/api/providers").andExpect(jsonPath("$.length()").value(0));

        // Using someone else's provider/category in your own bill or schedule
        postAs(intruder, "/api/bills", billBody("Sneaky", providerId, categoryId(intruder, "Rent"), "1.00",
                today(intruder))).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("providerId"));
        String intruderProvider = createProvider(intruder, "Own provider");
        postAs(intruder, "/api/bills", billBody("Sneaky", intruderProvider, categoryId, "1.00", today(intruder)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("categoryId"));

        // Schedules
        getAs(intruder, "/api/schedules/{id}", scheduleId).andExpect(status().isNotFound());
        postAs(intruder, "/api/schedules/{id}/pause", null, scheduleId).andExpect(status().isNotFound());
        deleteAs(intruder, "/api/schedules/{id}", scheduleId).andExpect(status().isNotFound());

        // Analytics only ever see your own bills
        getAs(intruder, "/api/analytics/summary").andExpect(jsonPath("$.outstanding.total").value("0.00"));

        // The owner's data is untouched
        getAs(owner, "/api/bills/{id}", billId).andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Bill 1650.00"))
                .andExpect(jsonPath("$.status").value("UNPAID"))
                .andExpect(jsonPath("$.documents.length()").value(1));
        getAs(owner, "/api/schedules/{id}", scheduleId).andExpect(jsonPath("$.schedule.active").value(true));
    }
}
