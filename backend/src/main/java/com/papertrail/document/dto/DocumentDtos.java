package com.papertrail.document.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.papertrail.common.NamedRef;

public final class DocumentDtos {

    private DocumentDtos() {
    }

    public record DocumentVersionResponse(
            UUID id,
            UUID billId,
            int versionNumber,
            String filename,
            String contentType,
            long sizeBytes,
            String sha256,
            Instant uploadedAt,
            boolean latest) {
    }

    public record ArchiveDocumentResponse(
            UUID id,
            UUID billId,
            String billTitle,
            LocalDate billDueDate,
            NamedRef provider,
            NamedRef category,
            int versionNumber,
            int versionCount,
            boolean latest,
            String filename,
            String contentType,
            long sizeBytes,
            Instant uploadedAt) {
    }

    /** A short-lived signed URL, issued only after the caller's ownership of the document is checked. */
    public record DocumentLinkResponse(String url, Instant expiresAt, String filename, String contentType,
            String disposition) {
    }
}
