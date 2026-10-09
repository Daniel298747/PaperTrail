package com.papertrail.schedule;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.papertrail.account.AccountService;
import com.papertrail.account.HouseholdTime;
import com.papertrail.account.User;
import com.papertrail.bill.Bill;
import com.papertrail.bill.BillRepository;
import com.papertrail.bill.BillService;
import com.papertrail.category.Category;
import com.papertrail.category.CategoryRepository;
import com.papertrail.common.ApiException;
import com.papertrail.common.Money;
import com.papertrail.common.NamedRef;
import com.papertrail.provider.Provider;
import com.papertrail.provider.ProviderRepository;
import com.papertrail.schedule.dto.ScheduleDtos.PreviewRequest;
import com.papertrail.schedule.dto.ScheduleDtos.ScheduleDetailResponse;
import com.papertrail.schedule.dto.ScheduleDtos.ScheduleRequest;
import com.papertrail.schedule.dto.ScheduleDtos.ScheduleResponse;

@Service
public class ScheduleService {

    private static final int UPCOMING_PREVIEW = 4;

    private final ScheduleRepository schedules;
    private final ScheduleOccurrenceLedger ledger;
    private final ProviderRepository providers;
    private final CategoryRepository categories;
    private final BillRepository bills;
    private final BillService billService;
    private final BillGenerationService generation;
    private final AccountService accounts;
    private final HouseholdTime time;

    public ScheduleService(ScheduleRepository schedules, ScheduleOccurrenceLedger ledger, ProviderRepository providers,
            CategoryRepository categories, BillRepository bills, BillService billService,
            BillGenerationService generation, AccountService accounts, HouseholdTime time) {
        this.schedules = schedules;
        this.ledger = ledger;
        this.providers = providers;
        this.categories = categories;
        this.bills = bills;
        this.billService = billService;
        this.generation = generation;
        this.accounts = accounts;
        this.time = time;
    }

    @Transactional(readOnly = true)
    public List<ScheduleResponse> list(UUID userId) {
        LocalDate today = time.today(accounts.require(userId));
        return schedules.findByUserIdOrderByActiveDescTitleAsc(userId).stream().map(s -> toResponse(s, today)).toList();
    }

    @Transactional(readOnly = true)
    public ScheduleDetailResponse get(UUID userId, UUID id) {
        LocalDate today = time.today(accounts.require(userId));
        RecurringBillSchedule schedule = require(userId, id);
        List<Bill> recent = bills.findBySchedule(id, userId, PageRequest.of(0, 12));
        return new ScheduleDetailResponse(toResponse(schedule, today), billService.summaries(recent, today));
    }

    /** Creating an active schedule immediately generates any instances already inside the horizon. */
    @Transactional
    public ScheduleDetailResponse create(UUID userId, ScheduleRequest request) {
        User user = accounts.require(userId);
        RecurringBillSchedule schedule = new RecurringBillSchedule(userId, user.getCurrency());
        apply(schedule, request, userId);
        schedules.saveAndFlush(schedule);
        if (schedule.isActive()) {
            generation.generateWithinTransaction(schedule.getId(), time.now());
        }
        return get(userId, schedule.getId());
    }

    /** Edits change future generation only; already generated bills are separate records and stay as they are. */
    @Transactional
    public ScheduleDetailResponse update(UUID userId, UUID id, ScheduleRequest request) {
        RecurringBillSchedule schedule = require(userId, id);
        if (request.version() != null && request.version() != schedule.getVersion()) {
            throw ApiException.conflict("stale_update", "This schedule was changed elsewhere. Reload it and try again.");
        }
        apply(schedule, request, userId);
        schedules.saveAndFlush(schedule);
        if (schedule.isActive()) {
            generation.generateWithinTransaction(schedule.getId(), time.now());
        }
        return get(userId, id);
    }

    @Transactional
    public ScheduleDetailResponse setActive(UUID userId, UUID id, boolean active) {
        RecurringBillSchedule schedule = require(userId, id);
        schedule.setActive(active);
        schedules.saveAndFlush(schedule);
        if (active) {
            generation.generateWithinTransaction(id, time.now());
        }
        return get(userId, id);
    }

    /** Generated bills are kept (their schedule link is cleared by the database); the ledger goes with it. */
    @Transactional
    public void delete(UUID userId, UUID id) {
        schedules.delete(require(userId, id));
    }

    public List<LocalDate> preview(UUID userId, PreviewRequest request) {
        LocalDate today = time.today(accounts.require(userId));
        RecurrenceRule rule = new RecurrenceRule(request.startDate(), request.billingDay(), request.frequency());
        LocalDate from = request.startDate().isAfter(today) ? request.startDate() : today;
        return rule.nextOccurrences(from, request.count() == null ? 6 : request.count());
    }

    private RecurringBillSchedule require(UUID userId, UUID id) {
        return schedules.findByIdAndUserId(id, userId).orElseThrow(() -> ApiException.notFound("Schedule"));
    }

    private void apply(RecurringBillSchedule schedule, ScheduleRequest request, UUID userId) {
        Provider provider = providers.findByIdAndUserId(request.providerId(), userId)
                .orElseThrow(() -> ApiException.invalidField("providerId", "Choose one of your providers."));
        Category category = categories.findByIdAndUserId(request.categoryId(), userId)
                .orElseThrow(() -> ApiException.invalidField("categoryId", "Choose one of your categories."));
        schedule.setTitle(request.title().trim());
        schedule.setProvider(provider);
        schedule.setCategory(category);
        schedule.setAmount(Money.normalize(request.amount()));
        schedule.setFrequency(request.frequency());
        schedule.setStartDate(request.startDate());
        schedule.setBillingDay(request.billingDay());
        schedule.setReminderLeadDays(request.reminderLeadDays());
        if (request.active() != null) {
            schedule.setActive(request.active());
        }
        schedule.setNotes(request.notes() == null || request.notes().isBlank() ? null : request.notes().trim());
    }

    private ScheduleResponse toResponse(RecurringBillSchedule s, LocalDate today) {
        LocalDate from = s.getStartDate().isAfter(today) ? s.getStartDate() : today;
        List<LocalDate> upcoming = s.rule().nextOccurrences(from, UPCOMING_PREVIEW);
        return new ScheduleResponse(s.getId(), s.getTitle(),
                new NamedRef(s.getProvider().getId(), s.getProvider().getName()),
                new NamedRef(s.getCategory().getId(), s.getCategory().getName()),
                Money.format(s.getAmount()), s.getCurrency(), s.getFrequency(), s.getStartDate(), s.getBillingDay(),
                s.getReminderLeadDays(), s.isActive(), s.getNotes(), upcoming,
                ledger.lastOccurrenceDate(s.getId()).orElse(null), ledger.count(s.getId()), s.getCreatedAt(),
                s.getVersion());
    }
}
