package com.papertrail;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.papertrail.support.IntegrationTest;

/**
 * The core flow at API level: log in, create a bill, upload two statement versions, retrieve the first
 * version, mark the bill paid, and confirm the outstanding balance moves. (The browser version of the same
 * flow lives in e2e/ and runs against the full stack.)
 */
class EndToEndFlowTest extends IntegrationTest {

    @Test
    void loginCreateUploadRetrievePayAndSeeTheBalanceChange() throws Exception {
        Session registered = register();
        Session session = login(registered.email(), PASSWORD);

        String providerId = createProvider(session, "Lumenfield Energy");
        String categoryId = categoryId(session, "Electricity");
        String before = read(getAs(session, "/api/analytics/summary"), "$.outstanding.total");

        String billId = read(postAs(session, "/api/bills", billBody("Electricity, September", providerId, categoryId,
                "112.45", today(session).plusDays(6))).andExpect(status().isCreated()), "$.id");
        String afterCreate = read(getAs(session, "/api/analytics/summary"), "$.outstanding.total");
        assertThat(new BigDecimal(afterCreate).subtract(new BigDecimal(before))).isEqualByComparingTo("112.45");

        byte[] first = "%PDF-1.4\n% first statement\n%%EOF\n".getBytes(StandardCharsets.US_ASCII);
        byte[] second = "%PDF-1.4\n% revised statement\n%%EOF\n".getBytes(StandardCharsets.US_ASCII);
        String firstId = read(upload(session, billId, "statement.pdf", "application/pdf", first)
                .andExpect(jsonPath("$.versionNumber").value(1)), "$.id");
        upload(session, billId, "statement-revised.pdf", "application/pdf", second)
                .andExpect(jsonPath("$.versionNumber").value(2));

        String url = read(getAs(session, "/api/documents/{id}/link", firstId).andExpect(status().isOk()), "$.url");
        String key = jdbc.sql("select storage_key from bill_document_versions where id = :id")
                .param("id", UUID.fromString(firstId)).query(String.class).single();
        assertThat(url).contains(key);
        assertThat(storage.get(key).content()).isEqualTo(first);

        postAs(session, "/api/bills/{id}/payment", Map.of(), billId).andExpect(jsonPath("$.status").value("PAID"));
        String afterPayment = read(getAs(session, "/api/analytics/summary"), "$.outstanding.total");
        assertThat(new BigDecimal(afterPayment)).isEqualByComparingTo(before);
    }
}
