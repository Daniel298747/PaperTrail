package com.papertrail.document;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;

import com.papertrail.seed.FictionalDocuments;

class DocumentTypeTest {

    @Test
    void detectsFormatsFromContentNotFromNames() {
        assertThat(DocumentType.detect("%PDF-1.7\n...".getBytes(StandardCharsets.US_ASCII))).contains(DocumentType.PDF);
        assertThat(DocumentType.detect(new byte[] { (byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n', 0 }))
                .contains(DocumentType.PNG);
        assertThat(DocumentType.detect(new byte[] { (byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0 }))
                .contains(DocumentType.JPEG);
    }

    @Test
    void acceptsPdfHeaderAfterLeadingJunkWithinTheFirstKilobyte() {
        byte[] bytes = ("\r\n\r\n" + "%PDF-1.4\n").getBytes(StandardCharsets.US_ASCII);
        assertThat(DocumentType.detect(bytes)).contains(DocumentType.PDF);
    }

    @Test
    void rejectsEverythingElse() {
        assertThat(DocumentType.detect("just some text, renamed to .pdf".getBytes(StandardCharsets.UTF_8))).isEmpty();
        assertThat(DocumentType.detect("GIF89a....".getBytes(StandardCharsets.US_ASCII))).isEmpty();
        assertThat(DocumentType.detect(new byte[] { 1, 2 })).isEmpty();
        assertThat(DocumentType.detect(new byte[0])).isEmpty();
    }

    @Test
    void generatedDemoDocumentsAreRecognised() {
        byte[] receipt = FictionalDocuments.receiptImage("Test", "Receipt", java.math.BigDecimal.TEN,
                java.time.LocalDate.of(2026, 1, 1), "png");
        assertThat(DocumentType.detect(receipt)).contains(DocumentType.PNG);
        byte[] jpeg = FictionalDocuments.receiptImage("Test", "Receipt", java.math.BigDecimal.TEN,
                java.time.LocalDate.of(2026, 1, 1), "jpg");
        assertThat(DocumentType.detect(jpeg)).contains(DocumentType.JPEG);
    }

    @Test
    void cleansFilenames() {
        assertThat(DocumentService.cleanFilename("C:\\Users\\me\\Statements\\march.pdf", DocumentType.PDF))
                .isEqualTo("march.pdf");
        assertThat(DocumentService.cleanFilename("../../etc/passwd", DocumentType.PDF)).isEqualTo("passwd");
        assertThat(DocumentService.cleanFilename("  ", DocumentType.PNG)).isEqualTo("statement.png");
        assertThat(DocumentService.cleanFilename(null, DocumentType.JPEG)).isEqualTo("statement.jpg");
        assertThat(DocumentService.cleanFilename("a".repeat(300) + ".pdf", DocumentType.PDF)).hasSize(200).endsWith(".pdf");
    }
}
