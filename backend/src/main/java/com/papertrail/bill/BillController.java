package com.papertrail.bill;

import java.time.LocalDate;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.papertrail.bill.dto.BillDtos.BillDetailResponse;
import com.papertrail.bill.dto.BillDtos.BillRequest;
import com.papertrail.bill.dto.BillDtos.BillSummaryResponse;
import com.papertrail.bill.dto.BillDtos.PaymentRequest;
import com.papertrail.common.ApiException;
import com.papertrail.common.PageResponse;
import com.papertrail.common.SortParser;
import com.papertrail.security.AuthUser;
import com.papertrail.security.CurrentUser;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/bills")
public class BillController {

    private static final Map<String, String> SORTABLE = Map.of(
            "dueDate", "dueDate",
            "amount", "amount",
            "title", "title",
            "provider", "provider.name",
            "category", "category.name",
            "status", "status",
            "paidDate", "paidDate",
            "createdAt", "createdAt");

    private final BillService bills;

    public BillController(BillService bills) {
        this.bills = bills;
    }

    @GetMapping
    public PageResponse<BillSummaryResponse> list(@CurrentUser AuthUser user,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) UUID providerId,
            @RequestParam(required = false) UUID categoryId,
            @RequestParam(required = false) UUID scheduleId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dueFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dueTo,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "dueDate,asc") String sort) {
        Sort order = SortParser.parse(sort, SORTABLE, Sort.by("dueDate"))
                .and(Sort.by(Sort.Direction.DESC, "createdAt"));
        BillFilter filter = new BillFilter(q, parseStatus(status), providerId, categoryId, scheduleId, dueFrom, dueTo);
        return bills.list(user.id(), filter, PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, 100), order));
    }

    @GetMapping("/{id}")
    public BillDetailResponse get(@CurrentUser AuthUser user, @PathVariable UUID id) {
        return bills.get(user.id(), id);
    }

    @PostMapping
    public ResponseEntity<BillDetailResponse> create(@CurrentUser AuthUser user,
            @Valid @RequestBody BillRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(bills.create(user.id(), request));
    }

    @PutMapping("/{id}")
    public BillDetailResponse update(@CurrentUser AuthUser user, @PathVariable UUID id,
            @Valid @RequestBody BillRequest request) {
        return bills.update(user.id(), id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@CurrentUser AuthUser user, @PathVariable UUID id) {
        bills.delete(user.id(), id);
        return ResponseEntity.noContent().build();
    }

    /** Mark paid. Body is optional; the payment date defaults to today in the household timezone. */
    @PostMapping("/{id}/payment")
    public BillDetailResponse markPaid(@CurrentUser AuthUser user, @PathVariable UUID id,
            @RequestBody(required = false) PaymentRequest request) {
        return bills.markPaid(user.id(), id, request);
    }

    @DeleteMapping("/{id}/payment")
    public BillDetailResponse markUnpaid(@CurrentUser AuthUser user, @PathVariable UUID id) {
        return bills.markUnpaid(user.id(), id);
    }

    private static BillFilter.StatusFilter parseStatus(String status) {
        if (status == null || status.isBlank() || status.equalsIgnoreCase("all")) {
            return null;
        }
        try {
            return BillFilter.StatusFilter.valueOf(status.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("invalid_status",
                    "Status must be one of outstanding, unpaid, overdue, paid or all.");
        }
    }
}
