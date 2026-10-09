package com.papertrail.document;

import java.time.Instant;
import java.util.UUID;

import com.papertrail.bill.Bill;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/** One uploaded statement. Immutable: a replacement upload creates the next version instead. */
@Entity
@Table(name = "bill_document_versions")
public class BillDocumentVersion {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "bill_id", nullable = false, updatable = false)
    private Bill bill;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "version_number", nullable = false, updatable = false)
    private int versionNumber;

    @Column(name = "original_filename", nullable = false, updatable = false, length = 255)
    private String originalFilename;

    @Column(name = "content_type", nullable = false, updatable = false, length = 100)
    private String contentType;

    @Column(name = "size_bytes", nullable = false, updatable = false)
    private long sizeBytes;

    @Column(nullable = false, updatable = false, length = 64)
    private String sha256;

    @Column(name = "storage_key", nullable = false, updatable = false, length = 512)
    private String storageKey;

    @Column(name = "uploaded_at", nullable = false, updatable = false)
    private Instant uploadedAt;

    protected BillDocumentVersion() {
    }

    public BillDocumentVersion(Bill bill, int versionNumber, String originalFilename, String contentType,
            long sizeBytes, String sha256, String storageKey, Instant uploadedAt) {
        this.bill = bill;
        this.userId = bill.getUserId();
        this.versionNumber = versionNumber;
        this.originalFilename = originalFilename;
        this.contentType = contentType;
        this.sizeBytes = sizeBytes;
        this.sha256 = sha256;
        this.storageKey = storageKey;
        this.uploadedAt = uploadedAt;
    }

    public UUID getId() {
        return id;
    }

    public Bill getBill() {
        return bill;
    }

    public UUID getUserId() {
        return userId;
    }

    public int getVersionNumber() {
        return versionNumber;
    }

    public String getOriginalFilename() {
        return originalFilename;
    }

    public String getContentType() {
        return contentType;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }

    public String getSha256() {
        return sha256;
    }

    public String getStorageKey() {
        return storageKey;
    }

    public Instant getUploadedAt() {
        return uploadedAt;
    }
}
