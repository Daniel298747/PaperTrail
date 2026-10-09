package com.papertrail.category;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.papertrail.support.IntegrationTest;

class ReferenceDataIntegrationTest extends IntegrationTest {

    @Test
    void starterCategoriesAreCreatedAndNamesAreUniquePerHousehold() throws Exception {
        Session session = register();
        getAs(session, "/api/categories")
                .andExpect(jsonPath("$[*].name", org.hamcrest.Matchers.containsInAnyOrder("Broadband", "Electricity",
                        "Gas", "Insurance", "Mobile", "Rent", "Subscriptions", "Water")));
        postAs(session, "/api/categories", Map.of("name", "electricity")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("category_exists"));
        postAs(session, "/api/providers", Map.of("name", "Fibrelane")).andExpect(status().isCreated());
        postAs(session, "/api/providers", Map.of("name", "FIBRELANE")).andExpect(status().isConflict());
        // Another household may reuse the same names.
        Session other = register();
        postAs(other, "/api/providers", Map.of("name", "Fibrelane")).andExpect(status().isCreated());
    }

    @Test
    void deletingAReferencedCategoryRequiresAnExplicitReassignment() throws Exception {
        Session session = register();
        String providerId = createProvider(session, "Northgate Gas");
        String gas = categoryId(session, "Gas");
        String heating = read(postAs(session, "/api/categories", Map.of("name", "Heating"))
                .andExpect(status().isCreated()), "$.id");
        String billId = createBill(session, providerId, gas, "70.00", today(session));
        Map<String, Object> provider = new HashMap<>();
        provider.put("name", "Northgate Gas");
        provider.put("defaultCategoryId", gas);
        putAs(session, "/api/providers/{id}", provider, providerId).andExpect(status().isOk())
                .andExpect(jsonPath("$.defaultCategory.name").value("Gas"));

        deleteAs(session, "/api/categories/{id}", gas)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("category_in_use"))
                .andExpect(jsonPath("$.billCount").value(1))
                .andExpect(jsonPath("$.scheduleCount").value(0));
        deleteAs(session, "/api/categories/{id}?reassignTo={target}", gas, gas).andExpect(status().isBadRequest());
        String foreign = categoryId(register(), "Gas");
        deleteAs(session, "/api/categories/{id}?reassignTo={target}", gas, foreign).andExpect(status().isBadRequest());

        deleteAs(session, "/api/categories/{id}?reassignTo={target}", gas, heating).andExpect(status().isNoContent());
        getAs(session, "/api/bills/{id}", billId).andExpect(jsonPath("$.category.name").value("Heating"));
        getAs(session, "/api/categories").andExpect(jsonPath("$[*].name", not(hasItem("Gas"))));
        getAs(session, "/api/providers").andExpect(jsonPath("$[0].defaultCategory").doesNotExist());

        // Unused categories delete directly.
        String unused = read(postAs(session, "/api/categories", Map.of("name", "Parking")), "$.id");
        deleteAs(session, "/api/categories/{id}", unused).andExpect(status().isNoContent());
    }

    @Test
    void deletingAReferencedProviderRequiresAnExplicitReassignment() throws Exception {
        Session session = register();
        String oldProvider = createProvider(session, "Old Telecom");
        String newProvider = createProvider(session, "Fibrelane");
        String category = categoryId(session, "Broadband");
        String billId = createBill(session, oldProvider, category, "45.00", today(session));

        getAs(session, "/api/providers").andExpect(
                jsonPath("$[?(@.name == 'Old Telecom')].billCount").value(1));
        deleteAs(session, "/api/providers/{id}", oldProvider).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("provider_in_use"));
        deleteAs(session, "/api/providers/{id}?reassignTo={target}", oldProvider, newProvider)
                .andExpect(status().isNoContent());
        getAs(session, "/api/bills/{id}", billId).andExpect(jsonPath("$.provider.name").value("Fibrelane"));
    }
}
