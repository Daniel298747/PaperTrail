package com.papertrail.document;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.papertrail.common.PageResponse;
import com.papertrail.common.SortParser;
import com.papertrail.document.dto.DocumentDtos.ArchiveDocumentResponse;
import com.papertrail.document.dto.DocumentDtos.DocumentLinkResponse;
import com.papertrail.document.dto.DocumentDtos.DocumentVersionResponse;
import com.papertrail.security.AuthUser;
import com.papertrail.security.CurrentUser;

@RestController
public class DocumentController {

    private static final Map<String, String> SORTABLE = Map.of(
            "uploadedAt", "uploadedAt",
            "filename", "originalFilename",
            "bill", "bill.title",
            "provider", "bill.provider.name",
            "size", "sizeBytes");

    private final DocumentService documents;

    public DocumentController(DocumentService documents) {
        this.documents = documents;
    }

    @GetMapping("/api/bills/{billId}/documents")
    public List<DocumentVersionResponse> versions(@CurrentUser AuthUser user, @PathVariable UUID billId) {
        return documents.listVersions(user.id(), billId);
    }

    /** Each upload becomes the next version; earlier versions stay retrievable. */
    @PostMapping(path = "/api/bills/{billId}/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<DocumentVersionResponse> upload(@CurrentUser AuthUser user, @PathVariable UUID billId,
            @RequestPart("file") MultipartFile file) {
        return ResponseEntity.status(HttpStatus.CREATED).body(documents.upload(user.id(), billId, file));
    }

    @GetMapping("/api/documents")
    public PageResponse<ArchiveDocumentResponse> archive(@CurrentUser AuthUser user,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) UUID providerId,
            @RequestParam(defaultValue = "false") boolean latestOnly,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "uploadedAt,desc") String sort) {
        Sort order = SortParser.parse(sort, SORTABLE, Sort.by(Sort.Direction.DESC, "uploadedAt"))
                .and(Sort.by(Sort.Direction.DESC, "versionNumber"));
        return documents.archive(user.id(), q, providerId, latestOnly,
                PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, 100), order));
    }

    /** Returns a signed URL valid for a few minutes. {@code download=true} forces a file download. */
    @GetMapping("/api/documents/{id}/link")
    public DocumentLinkResponse link(@CurrentUser AuthUser user, @PathVariable UUID id,
            @RequestParam(defaultValue = "false") boolean download) {
        return documents.link(user.id(), id, download);
    }
}
