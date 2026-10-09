package com.papertrail.document;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

import com.papertrail.bill.Bill;
import com.papertrail.bill.BillRepository;
import com.papertrail.common.ApiException;
import com.papertrail.common.NamedRef;
import com.papertrail.common.PageResponse;
import com.papertrail.config.AppProperties;
import com.papertrail.document.dto.DocumentDtos.ArchiveDocumentResponse;
import com.papertrail.document.dto.DocumentDtos.DocumentLinkResponse;
import com.papertrail.document.dto.DocumentDtos.DocumentVersionResponse;
import com.papertrail.storage.ObjectStorage;

import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;

@Service
public class DocumentService {

    private final BillRepository bills;
    private final DocumentVersionRepository versions;
    private final ObjectStorage storage;
    private final TransactionTemplate transactions;
    private final Clock clock;
    private final long maxUploadBytes;
    private final Duration linkTtl;

    public DocumentService(BillRepository bills, DocumentVersionRepository versions, ObjectStorage storage,
            PlatformTransactionManager transactionManager, Clock clock, AppProperties properties) {
        this.bills = bills;
        this.versions = versions;
        this.storage = storage;
        this.transactions = new TransactionTemplate(transactionManager);
        this.clock = clock;
        this.maxUploadBytes = properties.uploads().maxFileSize().toBytes();
        this.linkTtl = properties.storage().presignTtl();
    }

    /**
     * Stores a new statement version. The object is written first under a fresh unique key; the metadata row
     * is then inserted in a short transaction holding a row lock on the bill. If that insert fails, the
     * object is removed again, so a failed upload never leaves a record that points at nothing.
     */
    public DocumentVersionResponse upload(UUID userId, UUID billId, MultipartFile file) {
        if (file == null) {
            throw ApiException.badRequest("file_missing", "Choose a statement file to upload.");
        }
        if (file.getSize() > maxUploadBytes) {
            throw tooLarge();
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw ApiException.badRequest("file_unreadable", "The upload could not be read. Try again.");
        }
        return store(userId, billId, file.getOriginalFilename(), bytes, null);
    }

    /**
     * Validates and stores statement bytes as the bill's next version.
     *
     * @param uploadedAt normally null (now); the demo seeder backdates its fictional statements
     */
    public DocumentVersionResponse store(UUID userId, UUID billId, String originalFilename, byte[] bytes,
            Instant uploadedAt) {
        if (!bills.existsByIdAndUserId(billId, userId)) {
            throw ApiException.notFound("Bill");
        }
        if (bytes.length == 0) {
            throw ApiException.badRequest("file_empty", "That file is empty. Choose a PDF, JPG or PNG statement.");
        }
        if (bytes.length > maxUploadBytes) {
            throw tooLarge();
        }
        DocumentType type = DocumentType.detect(bytes).orElseThrow(() -> new ApiException(
                HttpStatus.UNSUPPORTED_MEDIA_TYPE, "unsupported_file_type", "Upload a PDF, JPG or PNG statement."));
        String filename = cleanFilename(originalFilename, type);
        String key = "statements/%s/%s/%s.%s".formatted(userId, billId, UUID.randomUUID(), type.extension());
        String checksum = sha256(bytes);
        Instant timestamp = uploadedAt == null ? clock.instant() : uploadedAt;

        storage.put(key, bytes, type.mimeType());
        try {
            return transactions.execute(status -> {
                Bill bill = bills.findByIdAndUserIdForUpdate(billId, userId)
                        .orElseThrow(() -> ApiException.notFound("Bill"));
                int nextVersion = versions.findMaxVersionNumber(billId) + 1;
                BillDocumentVersion saved = versions.saveAndFlush(new BillDocumentVersion(bill, nextVersion,
                        filename, type.mimeType(), bytes.length, checksum, key, timestamp));
                return toResponse(saved, true);
            });
        } catch (RuntimeException e) {
            storage.deleteQuietly(key);
            throw e;
        }
    }

    private ApiException tooLarge() {
        return new ApiException(HttpStatus.CONTENT_TOO_LARGE, "file_too_large",
                "Statements can be at most " + (maxUploadBytes / (1024 * 1024)) + " MB.");
    }

    @Transactional(readOnly = true)
    public List<DocumentVersionResponse> listVersions(UUID userId, UUID billId) {
        if (!bills.existsByIdAndUserId(billId, userId)) {
            throw ApiException.notFound("Bill");
        }
        return toResponses(versions.findVersions(billId, userId));
    }

    public static List<DocumentVersionResponse> toResponses(List<BillDocumentVersion> newestFirst) {
        List<DocumentVersionResponse> result = new ArrayList<>(newestFirst.size());
        for (int i = 0; i < newestFirst.size(); i++) {
            result.add(toResponse(newestFirst.get(i), i == 0));
        }
        return result;
    }

    @Transactional(readOnly = true)
    public PageResponse<ArchiveDocumentResponse> archive(UUID userId, String text, UUID providerId,
            boolean latestOnly, Pageable pageable) {
        Page<BillDocumentVersion> page = versions.findAll(archiveSpec(userId, text, providerId, latestOnly),
                pageable);
        Set<UUID> billIds = page.getContent().stream().map(d -> d.getBill().getId()).collect(Collectors.toSet());
        Map<UUID, int[]> stats = billIds.isEmpty() ? Map.of()
                : versions.statsByBill(billIds).stream().collect(Collectors.toMap(row -> (UUID) row[0],
                        row -> new int[] { ((Number) row[1]).intValue(), ((Number) row[2]).intValue() }));
        List<ArchiveDocumentResponse> content = page.getContent().stream().map(d -> {
            Bill bill = d.getBill();
            int[] billStats = stats.getOrDefault(bill.getId(), new int[] { 1, d.getVersionNumber() });
            return new ArchiveDocumentResponse(d.getId(), bill.getId(), bill.getTitle(), bill.getDueDate(),
                    new NamedRef(bill.getProvider().getId(), bill.getProvider().getName()),
                    new NamedRef(bill.getCategory().getId(), bill.getCategory().getName()), d.getVersionNumber(),
                    billStats[0], d.getVersionNumber() == billStats[1], d.getOriginalFilename(), d.getContentType(),
                    d.getSizeBytes(), d.getUploadedAt());
        }).toList();
        return PageResponse.of(page, content);
    }

    /** Ownership is checked before anything is signed; other households get the same 404 as a missing id. */
    @Transactional(readOnly = true)
    public DocumentLinkResponse link(UUID userId, UUID documentId, boolean download) {
        BillDocumentVersion document = versions.findByIdAndUserId(documentId, userId)
                .orElseThrow(() -> ApiException.notFound("Document"));
        String disposition = ContentDisposition.builder(download ? "attachment" : "inline")
                .filename(document.getOriginalFilename(), StandardCharsets.UTF_8)
                .build().toString();
        Instant expiresAt = clock.instant().plus(linkTtl);
        String url = storage.presignGet(document.getStorageKey(), linkTtl, document.getContentType(), disposition)
                .toString();
        return new DocumentLinkResponse(url, expiresAt, document.getOriginalFilename(), document.getContentType(),
                download ? "attachment" : "inline");
    }

    private static Specification<BillDocumentVersion> archiveSpec(UUID userId, String text, UUID providerId,
            boolean latestOnly) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("userId"), userId));
            Join<Object, Object> bill = root.join("bill");
            if (text != null && !text.isBlank()) {
                String pattern = "%" + escapeLike(text.trim().toLowerCase(Locale.ROOT)) + "%";
                Join<Object, Object> provider = bill.join("provider");
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("originalFilename")), pattern, '\\'),
                        cb.like(cb.lower(bill.get("title")), pattern, '\\'),
                        cb.like(cb.lower(provider.get("name")), pattern, '\\')));
            }
            if (providerId != null) {
                predicates.add(cb.equal(bill.get("provider").get("id"), providerId));
            }
            if (latestOnly && query != null) {
                Subquery<Integer> latest = query.subquery(Integer.class);
                Root<BillDocumentVersion> other = latest.from(BillDocumentVersion.class);
                latest.select(cb.max(other.<Integer>get("versionNumber")))
                        .where(cb.equal(other.get("bill"), root.get("bill")));
                predicates.add(cb.equal(root.get("versionNumber"), latest));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    static DocumentVersionResponse toResponse(BillDocumentVersion version, boolean latest) {
        return new DocumentVersionResponse(version.getId(), version.getBill().getId(), version.getVersionNumber(),
                version.getOriginalFilename(), version.getContentType(), version.getSizeBytes(), version.getSha256(),
                version.getUploadedAt(), latest);
    }

    /** Keeps only the final path segment, strips control characters and bounds the length. */
    static String cleanFilename(String original, DocumentType type) {
        String name = original == null ? "" : original.replace('\\', '/');
        name = name.substring(name.lastIndexOf('/') + 1).replaceAll("\\p{Cntrl}", "").trim();
        if (name.isEmpty() || name.equals(".") || name.equals("..")) {
            name = "statement." + type.extension();
        }
        if (name.length() > 200) {
            int dot = name.lastIndexOf('.');
            String extension = dot > 0 && name.length() - dot <= 10 ? name.substring(dot) : "";
            name = name.substring(0, 200 - extension.length()) + extension;
        }
        return name;
    }

    static String escapeLike(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
