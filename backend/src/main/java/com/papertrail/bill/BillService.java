package com.papertrail.bill;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.papertrail.account.AccountService;
import com.papertrail.account.HouseholdTime;
import com.papertrail.account.User;
import com.papertrail.bill.dto.BillDtos.BillDetailResponse;
import com.papertrail.bill.dto.BillDtos.BillRequest;
import com.papertrail.bill.dto.BillDtos.BillSummaryResponse;
import com.papertrail.bill.dto.BillDtos.PaymentRequest;
import com.papertrail.category.Category;
import com.papertrail.category.CategoryRepository;
import com.papertrail.common.ApiException;
import com.papertrail.common.Money;
import com.papertrail.common.NamedRef;
import com.papertrail.common.PageResponse;
import com.papertrail.document.DocumentService;
import com.papertrail.document.DocumentVersionRepository;
import com.papertrail.provider.Provider;
import com.papertrail.provider.ProviderRepository;
import com.papertrail.schedule.RecurringBillSchedule;
import com.papertrail.storage.ObjectStorage;

@Service
public class BillService {

    private final BillRepository bills;
    private final ProviderRepository providers;
    private final CategoryRepository categories;
    private final DocumentVersionRepository documents;
    private final ObjectStorage storage;
    private final AccountService accounts;
    private final HouseholdTime time;

    public BillService(BillRepository bills, ProviderRepository providers, CategoryRepository categories,
            DocumentVersionRepository documents, ObjectStorage storage, AccountService accounts, HouseholdTime time) {
        this.bills = bills;
        this.providers = providers;
        this.categories = categories;
        this.documents = documents;
        this.storage = storage;
        this.accounts = accounts;
        this.time = time;
    }

    @Transactional(readOnly = true)
    public PageResponse<BillSummaryResponse> list(UUID userId, BillFilter filter, Pageable pageable) {
        LocalDate today = time.today(accounts.require(userId));
        Page<Bill> page = bills.findAll(BillSpecifications.matching(userId, filter, today), pageable);
        return PageResponse.of(page, summaries(page.getContent(), today));
    }

    @Transactional(readOnly = true)
    public BillDetailResponse get(UUID userId, UUID billId) {
        LocalDate today = time.today(accounts.require(userId));
        return detail(require(userId, billId), today);
    }

    @Transactional
    public BillDetailResponse create(UUID userId, BillRequest request) {
        User user = accounts.require(userId);
        Bill bill = new Bill(userId, user.getCurrency());
        apply(bill, request, userId, user.getDefaultReminderLeadDays());
        bills.saveAndFlush(bill);
        return detail(bill, time.today(user));
    }

    @Transactional
    public BillDetailResponse update(UUID userId, UUID billId, BillRequest request) {
        User user = accounts.require(userId);
        Bill bill = require(userId, billId);
        if (request.version() != null && request.version() != bill.getVersion()) {
            throw ApiException.conflict("stale_update", "This bill was changed elsewhere. Reload it and try again.");
        }
        apply(bill, request, userId, bill.getReminderLeadDays());
        bills.saveAndFlush(bill);
        return detail(bill, time.today(user));
    }

    /** Deletes the bill with its statement versions and reminders; stored files are removed after commit. */
    @Transactional
    public void delete(UUID userId, UUID billId) {
        Bill bill = require(userId, billId);
        List<String> storageKeys = documents.findStorageKeysByBill(billId);
        bills.delete(bill);
        bills.flush();
        if (!storageKeys.isEmpty()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    storageKeys.forEach(storage::deleteQuietly);
                }
            });
        }
    }

    @Transactional
    public BillDetailResponse markPaid(UUID userId, UUID billId, PaymentRequest request) {
        User user = accounts.require(userId);
        LocalDate today = time.today(user);
        Bill bill = require(userId, billId);
        LocalDate paidOn = request == null || request.paidDate() == null ? today : request.paidDate();
        if (paidOn.isAfter(today)) {
            throw ApiException.invalidField("paidDate", "The payment date can't be in the future.");
        }
        bill.markPaid(paidOn);
        bills.saveAndFlush(bill);
        return detail(bill, today);
    }

    @Transactional
    public BillDetailResponse markUnpaid(UUID userId, UUID billId) {
        User user = accounts.require(userId);
        Bill bill = require(userId, billId);
        bill.markUnpaid();
        bills.saveAndFlush(bill);
        return detail(bill, time.today(user));
    }

    Bill require(UUID userId, UUID billId) {
        return bills.findByIdAndUserId(billId, userId).orElseThrow(() -> ApiException.notFound("Bill"));
    }

    private void apply(Bill bill, BillRequest request, UUID userId, int fallbackLeadDays) {
        Provider provider = providers.findByIdAndUserId(request.providerId(), userId)
                .orElseThrow(() -> ApiException.invalidField("providerId", "Choose one of your providers."));
        Category category = categories.findByIdAndUserId(request.categoryId(), userId)
                .orElseThrow(() -> ApiException.invalidField("categoryId", "Choose one of your categories."));
        bill.setTitle(request.title().trim());
        bill.setProvider(provider);
        bill.setCategory(category);
        bill.setAmount(Money.normalize(request.amount()));
        bill.setDueDate(request.dueDate());
        bill.setReminderLeadDays(request.reminderLeadDays() == null ? fallbackLeadDays : request.reminderLeadDays());
        bill.setNotes(request.notes() == null || request.notes().isBlank() ? null : request.notes().trim());
    }

    public List<BillSummaryResponse> summaries(List<Bill> page, LocalDate today) {
        Set<UUID> ids = page.stream().map(Bill::getId).collect(Collectors.toSet());
        Map<UUID, Integer> documentCounts = ids.isEmpty() ? Map.of()
                : documents.statsByBill(ids).stream().collect(Collectors.toMap(
                        row -> (UUID) row[0], row -> ((Number) row[1]).intValue()));
        return page.stream().map(bill -> summary(bill, today, documentCounts.getOrDefault(bill.getId(), 0)))
                .toList();
    }

    static BillSummaryResponse summary(Bill bill, LocalDate today, int documentCount) {
        return new BillSummaryResponse(bill.getId(), bill.getTitle(), providerRef(bill), categoryRef(bill),
                Money.format(bill.getAmount()), bill.getCurrency(), bill.getDueDate(), bill.effectiveStatus(today),
                bill.getPaidDate(), ChronoUnit.DAYS.between(today, bill.getDueDate()), documentCount,
                scheduleRef(bill.getSchedule()), bill.getVersion());
    }

    private BillDetailResponse detail(Bill bill, LocalDate today) {
        return new BillDetailResponse(bill.getId(), bill.getTitle(), providerRef(bill), categoryRef(bill),
                Money.format(bill.getAmount()), bill.getCurrency(), bill.getDueDate(), bill.effectiveStatus(today),
                bill.getPaidDate(), ChronoUnit.DAYS.between(today, bill.getDueDate()), bill.getReminderLeadDays(),
                bill.getNotes(), scheduleRef(bill.getSchedule()),
                DocumentService.toResponses(documents.findVersions(bill.getId(), bill.getUserId())),
                bill.getCreatedAt(), bill.getUpdatedAt(), bill.getVersion());
    }

    private static NamedRef providerRef(Bill bill) {
        return new NamedRef(bill.getProvider().getId(), bill.getProvider().getName());
    }

    private static NamedRef categoryRef(Bill bill) {
        return new NamedRef(bill.getCategory().getId(), bill.getCategory().getName());
    }

    private static NamedRef scheduleRef(RecurringBillSchedule schedule) {
        return schedule == null ? null : new NamedRef(schedule.getId(), schedule.getTitle());
    }
}
