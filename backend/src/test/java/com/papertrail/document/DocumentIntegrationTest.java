package com.papertrail.document;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.papertrail.support.IntegrationTest;

class DocumentIntegrationTest extends IntegrationTest {

    private String storageKey(String documentId) {
        return jdbc.sql("select storage_key from bill_document_versions where id = :id")
                .param("id", UUID.fromString(documentId)).query(String.class).single();
    }

    private long versionCount(String billId) {
        return jdbc.sql("select count(*) from bill_document_versions where bill_id = :id")
                .param("id", UUID.fromString(billId)).query(Long.class).single();
    }

    @Test
    void everyUploadBecomesANewVersionAndEarlierVersionsStayRetrievable() throws Exception {
        Session session = register();
        String[] refs = providerAndCategory(session);
        String billId = createBill(session, refs[0], refs[1], "84.20", today(session));

        String v1 = read(upload(session, billId, "march.pdf", "application/pdf", PDF_BYTES)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.versionNumber").value(1))
                .andExpect(jsonPath("$.contentType").value("application/pdf"))
                .andExpect(jsonPath("$.sizeBytes").value(PDF_BYTES.length))
                .andExpect(jsonPath("$.sha256").value(org.hamcrest.Matchers.hasLength(64))), "$.id");
        // Declared type and extension are ignored: the PNG signature decides.
        String v2 = read(upload(session, billId, "march-corrected.png", "application/octet-stream", PNG_BYTES)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.versionNumber").value(2))
                .andExpect(jsonPath("$.contentType").value("image/png")), "$.id");

        getAs(session, "/api/bills/{id}", billId)
                .andExpect(jsonPath("$.documents", hasSize(2)))
                .andExpect(jsonPath("$.documents[0].versionNumber").value(2))
                .andExpect(jsonPath("$.documents[0].latest").value(true))
                .andExpect(jsonPath("$.documents[1].versionNumber").value(1))
                .andExpect(jsonPath("$.documents[1].latest").value(false))
                .andExpect(jsonPath("$.documents[1].filename").value("march.pdf"));

        String keyV1 = storageKey(v1);
        String keyV2 = storageKey(v2);
        assertThat(keyV1).isNotEqualTo(keyV2).startsWith("statements/" + session.userId() + "/" + billId + "/");
        assertThat(storage.get(keyV1).content()).isEqualTo(PDF_BYTES);
        assertThat(storage.get(keyV2).content()).isEqualTo(PNG_BYTES);

        getAs(session, "/api/documents/{id}/link", v1)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.url", containsString(keyV1)))
                .andExpect(jsonPath("$.url", containsString("X-Amz-Expires=300")))
                .andExpect(jsonPath("$.disposition").value("inline"))
                .andExpect(jsonPath("$.filename").value("march.pdf"));
        getAs(session, "/api/documents/{id}/link?download=true", v1)
                .andExpect(jsonPath("$.disposition").value("attachment"))
                .andExpect(jsonPath("$.url", containsString("attachment")));
    }

    @Test
    void rejectsUnsupportedOversizedAndEmptyFilesWithoutCreatingRecords() throws Exception {
        Session session = register();
        String[] refs = providerAndCategory(session);
        String billId = createBill(session, refs[0], refs[1], "10.00", today(session));
        int objectsBefore = storage.size();

        upload(session, billId, "statement.pdf", "application/pdf",
                "plain text pretending to be a PDF".getBytes(StandardCharsets.UTF_8))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.code").value("unsupported_file_type"));
        byte[] oversized = new byte[1024 * 1024 + 1];
        System.arraycopy(PDF_BYTES, 0, oversized, 0, PDF_BYTES.length);
        upload(session, billId, "huge.pdf", "application/pdf", oversized)
                .andExpect(status().isContentTooLarge())
                .andExpect(jsonPath("$.code").value("file_too_large"));
        upload(session, billId, "empty.pdf", "application/pdf", new byte[0])
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("file_empty"));

        assertThat(versionCount(billId)).isZero();
        assertThat(storage.size()).isEqualTo(objectsBefore);
    }

    @Test
    void storageOutageLeavesNoRecord() throws Exception {
        Session session = register();
        String[] refs = providerAndCategory(session);
        String billId = createBill(session, refs[0], refs[1], "10.00", today(session));

        storage.failPuts(true);
        upload(session, billId, "march.pdf", "application/pdf", PDF_BYTES)
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("storage_unavailable"));
        assertThat(versionCount(billId)).isZero();

        storage.failPuts(false);
        upload(session, billId, "march.pdf", "application/pdf", PDF_BYTES)
                .andExpect(jsonPath("$.versionNumber").value(1));
    }

    @Test
    void aFailedMetadataInsertRemovesTheStoredObject() throws Exception {
        Session session = register();
        String[] refs = providerAndCategory(session);
        String billId = createBill(session, refs[0], refs[1], "10.00", today(session));
        String prefix = "statements/" + session.userId() + "/" + billId + "/";
        String[] storedKey = new String[1];
        // The bill disappears between the object write and the metadata insert (e.g. deleted in another tab).
        storage.afterPut(key -> {
            storedKey[0] = key;
            jdbc.sql("delete from bills where id = :id").param("id", UUID.fromString(billId)).update();
        });

        upload(session, billId, "march.pdf", "application/pdf", PDF_BYTES).andExpect(status().isNotFound());

        assertThat(storedKey[0]).startsWith(prefix);
        assertThat(storage.contains(storedKey[0])).isFalse();
    }

    @Test
    void archiveListsAllVersionsWithLatestFlagsAndFilters() throws Exception {
        Session session = register();
        String providerId = createProvider(session, "Riverbend Water");
        String billId = createBill(session, providerId, categoryId(session, "Water"), "96.40", today(session));
        upload(session, billId, "water-q3.pdf", "application/pdf", PDF_BYTES).andExpect(status().isCreated());
        upload(session, billId, "water-q3-corrected.pdf", "application/pdf", PDF_BYTES).andExpect(status().isCreated());

        getAs(session, "/api/documents")
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.content[0].versionNumber").value(2))
                .andExpect(jsonPath("$.content[0].latest").value(true))
                .andExpect(jsonPath("$.content[0].versionCount").value(2))
                .andExpect(jsonPath("$.content[1].latest").value(false))
                .andExpect(jsonPath("$.content[0].provider.name").value("Riverbend Water"));
        getAs(session, "/api/documents?latestOnly=true").andExpect(jsonPath("$.totalElements").value(1));
        getAs(session, "/api/documents?q=corrected").andExpect(jsonPath("$.content[*].filename",
                org.hamcrest.Matchers.contains("water-q3-corrected.pdf")));
        getAs(session, "/api/documents?q=riverbend").andExpect(jsonPath("$.totalElements").value(2));
    }

    @Test
    void deletingABillRemovesItsStoredStatements() throws Exception {
        Session session = register();
        String[] refs = providerAndCategory(session);
        String billId = createBill(session, refs[0], refs[1], "10.00", today(session));
        String v1 = read(upload(session, billId, "a.pdf", "application/pdf", PDF_BYTES), "$.id");
        String v2 = read(upload(session, billId, "b.pdf", "application/pdf", PDF_BYTES), "$.id");
        List<String> keys = List.of(storageKey(v1), storageKey(v2));

        deleteAs(session, "/api/bills/{id}", billId).andExpect(status().isNoContent());

        assertThat(keys).noneMatch(storage::contains);
        assertThat(versionCount(billId)).isZero();
    }
}
