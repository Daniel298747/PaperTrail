package com.papertrail.bill;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.papertrail.support.IntegrationTest;

class BillIntegrationTest extends IntegrationTest {

    @Test
    void createReadUpdateDelete() throws Exception {
        Session session = register();
        String providerId = createProvider(session, "Lumenfield Energy");
        String categoryId = categoryId(session, "Electricity");
        LocalDate today = today(session);

        Map<String, Object> body = billBody("Electricity, March", providerId, categoryId, "84.2", today.plusDays(10));
        body.put("notes", "  Estimated reading  ");
        String id = read(postAs(session, "/api/bills", body)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value("Electricity, March"))
                .andExpect(jsonPath("$.amount").value("84.20"))
                .andExpect(jsonPath("$.currency").value("EUR"))
                .andExpect(jsonPath("$.status").value("UNPAID"))
                .andExpect(jsonPath("$.daysUntilDue").value(10))
                .andExpect(jsonPath("$.provider.name").value("Lumenfield Energy"))
                .andExpect(jsonPath("$.category.name").value("Electricity"))
                .andExpect(jsonPath("$.reminderLeadDays").value(3))
                .andExpect(jsonPath("$.notes").value("Estimated reading"))
                .andExpect(jsonPath("$.documents", hasSize(0))), "$.id");

        Integer version = read(getAs(session, "/api/bills/{id}", id).andExpect(status().isOk()), "$.version");
        Map<String, Object> update = billBody("Electricity, March (actual)", providerId, categoryId, "79.95",
                today.plusDays(12));
        update.put("version", version);
        update.put("reminderLeadDays", 7);
        putAs(session, "/api/bills/{id}", update, id)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amount").value("79.95"))
                .andExpect(jsonPath("$.reminderLeadDays").value(7))
                .andExpect(jsonPath("$.dueDate").value(today.plusDays(12).toString()));

        // The stale version from before the update is now a conflict.
        putAs(session, "/api/bills/{id}", update, id)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("stale_update"));

        deleteAs(session, "/api/bills/{id}", id).andExpect(status().isNoContent());
        getAs(session, "/api/bills/{id}", id).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("not_found"));
    }

    @Test
    void validationErrorsAreReportedPerField() throws Exception {
        Session session = register();
        String[] refs = providerAndCategory(session);
        Map<String, Object> body = billBody("", refs[0], refs[1], "-5.00", today(session));
        body.put("reminderLeadDays", 99);
        postAs(session, "/api/bills", body)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"))
                .andExpect(jsonPath("$.errors[?(@.field == 'title')]").exists())
                .andExpect(jsonPath("$.errors[?(@.field == 'amount')]").exists())
                .andExpect(jsonPath("$.errors[?(@.field == 'reminderLeadDays')]").exists());

        postAs(session, "/api/bills", billBody("Too precise", refs[0], refs[1], "10.005", today(session)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("amount"));

        postAs(session, "/api/bills", Map.of("title", "Broken date", "dueDate", "31/02/2026"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("malformed_request"));
    }

    @Test
    void overdueIsDerivedFromTheDueDateInTheHouseholdTimezone() throws Exception {
        Session session = register("Pacific/Kiritimati");
        String[] refs = providerAndCategory(session);
        LocalDate today = today(session);

        String overdue = createBill(session, refs[0], refs[1], "30.00", today.minusDays(1));
        String dueToday = createBill(session, refs[0], refs[1], "40.00", today);

        getAs(session, "/api/bills/{id}", overdue)
                .andExpect(jsonPath("$.status").value("OVERDUE"))
                .andExpect(jsonPath("$.daysUntilDue").value(-1));
        getAs(session, "/api/bills/{id}", dueToday)
                .andExpect(jsonPath("$.status").value("UNPAID"))
                .andExpect(jsonPath("$.daysUntilDue").value(0));
    }

    @Test
    void markPaidAndUnpaid() throws Exception {
        Session session = register();
        String[] refs = providerAndCategory(session);
        LocalDate today = today(session);
        String id = createBill(session, refs[0], refs[1], "55.10", today.minusDays(3));

        postAs(session, "/api/bills/{id}/payment", Map.of("paidDate", today.plusDays(1).toString()), id)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("paidDate"));

        postAs(session, "/api/bills/{id}/payment", null, id)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAID"))
                .andExpect(jsonPath("$.paidDate").value(today.toString()));

        postAs(session, "/api/bills/{id}/payment", Map.of("paidDate", today.minusDays(5).toString()), id)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paidDate").value(today.minusDays(5).toString()));

        deleteAs(session, "/api/bills/{id}/payment", id)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("OVERDUE"))
                .andExpect(jsonPath("$.paidDate").doesNotExist());
    }

    @Test
    void listSupportsSearchFiltersSortingAndPagination() throws Exception {
        Session session = register();
        String energy = createProvider(session, "Lumenfield Energy");
        String water = createProvider(session, "Riverbend Water");
        String electricity = categoryId(session, "Electricity");
        String waterCategory = categoryId(session, "Water");
        LocalDate today = today(session);

        postAs(session, "/api/bills", billBody("Electricity January", energy, electricity, "120.00", today.minusDays(40)))
                .andExpect(status().isCreated());
        String overdueWater = read(postAs(session, "/api/bills",
                billBody("Water Q3", water, waterCategory, "96.40", today.minusDays(2))), "$.id");
        String paid = createBill(session, energy, electricity, "88.00", today.minusDays(10));
        postAs(session, "/api/bills/{id}/payment", null, paid).andExpect(status().isOk());
        postAs(session, "/api/bills", billBody("Electricity upcoming", energy, electricity, "91.30", today.plusDays(5)))
                .andExpect(status().isCreated());

        getAs(session, "/api/bills?status=overdue&sort=dueDate,asc")
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.content[*].title", contains("Electricity January", "Water Q3")));
        getAs(session, "/api/bills?status=outstanding").andExpect(jsonPath("$.totalElements").value(3));
        getAs(session, "/api/bills?status=unpaid").andExpect(jsonPath("$.content[*].title",
                contains("Electricity upcoming")));
        getAs(session, "/api/bills?status=paid").andExpect(jsonPath("$.content[0].id").value(paid));
        getAs(session, "/api/bills?q=riverbend").andExpect(jsonPath("$.content[*].id", contains(overdueWater)));
        getAs(session, "/api/bills?q=WATER").andExpect(jsonPath("$.totalElements").value(1));
        getAs(session, "/api/bills?providerId={p}", energy).andExpect(jsonPath("$.totalElements").value(3));
        getAs(session, "/api/bills?categoryId={c}", waterCategory).andExpect(jsonPath("$.totalElements").value(1));
        getAs(session, "/api/bills?dueFrom={f}&dueTo={t}", today.minusDays(10), today.plusDays(10))
                .andExpect(jsonPath("$.totalElements").value(3));
        getAs(session, "/api/bills?sort=amount,desc")
                .andExpect(jsonPath("$.content[*].amount", contains("120.00", "96.40", "91.30", "88.00")));
        getAs(session, "/api/bills?sort=provider,desc&size=2&page=0")
                .andExpect(jsonPath("$.content[0].provider.name").value("Riverbend Water"))
                .andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.size").value(2));
        getAs(session, "/api/bills?sort=password,asc").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_sort"));
        getAs(session, "/api/bills?status=sometimes").andExpect(status().isBadRequest());
    }

    @Test
    void referencesMustBelongToTheHousehold() throws Exception {
        Session session = register();
        String[] refs = providerAndCategory(session);
        postAs(session, "/api/bills", billBody("Unknown provider", java.util.UUID.randomUUID().toString(), refs[1],
                "10.00", today(session)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("providerId"));
    }
}
