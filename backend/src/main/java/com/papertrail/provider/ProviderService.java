package com.papertrail.provider;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.papertrail.bill.BillRepository;
import com.papertrail.category.Category;
import com.papertrail.category.CategoryRepository;
import com.papertrail.common.ApiException;
import com.papertrail.common.NamedRef;
import com.papertrail.common.UsageCounts;
import com.papertrail.provider.dto.ProviderDtos.ProviderRequest;
import com.papertrail.provider.dto.ProviderDtos.ProviderResponse;
import com.papertrail.schedule.ScheduleRepository;

@Service
public class ProviderService {

    private final ProviderRepository providers;
    private final CategoryRepository categories;
    private final BillRepository bills;
    private final ScheduleRepository schedules;

    public ProviderService(ProviderRepository providers, CategoryRepository categories, BillRepository bills,
            ScheduleRepository schedules) {
        this.providers = providers;
        this.categories = categories;
        this.bills = bills;
        this.schedules = schedules;
    }

    public Provider require(UUID userId, UUID id) {
        return providers.findByIdAndUserId(id, userId).orElseThrow(() -> ApiException.notFound("Provider"));
    }

    @Transactional(readOnly = true)
    public List<ProviderResponse> list(UUID userId) {
        Map<UUID, Long> billCounts = UsageCounts.toMap(bills.countByProvider(userId));
        Map<UUID, Long> scheduleCounts = UsageCounts.toMap(schedules.countByProvider(userId));
        return providers.findByUserIdOrderByNameAsc(userId).stream()
                .map(p -> toResponse(p, billCounts.getOrDefault(p.getId(), 0L),
                        scheduleCounts.getOrDefault(p.getId(), 0L)))
                .toList();
    }

    @Transactional
    public ProviderResponse create(UUID userId, ProviderRequest request) {
        String name = request.name().trim();
        if (providers.existsByName(userId, name)) {
            throw ApiException.conflict("provider_exists", "You already have a provider called \"" + name + "\".");
        }
        Provider provider = providers.saveAndFlush(new Provider(userId, name, defaultCategory(userId, request)));
        return toResponse(provider, 0, 0);
    }

    @Transactional
    public ProviderResponse update(UUID userId, UUID id, ProviderRequest request) {
        Provider provider = require(userId, id);
        String name = request.name().trim();
        if (providers.existsByNameExcluding(userId, name, id)) {
            throw ApiException.conflict("provider_exists", "You already have a provider called \"" + name + "\".");
        }
        provider.setName(name);
        provider.setDefaultCategory(defaultCategory(userId, request));
        providers.saveAndFlush(provider);
        return toResponse(provider, bills.countByUserIdAndProvider(userId, provider),
                schedules.countByUserIdAndProvider(userId, provider));
    }

    /** Same contract as categories: refuse while in use unless the caller names a reassignment target. */
    @Transactional
    public void delete(UUID userId, UUID id, UUID reassignTo) {
        Provider provider = require(userId, id);
        long billCount = bills.countByUserIdAndProvider(userId, provider);
        long scheduleCount = schedules.countByUserIdAndProvider(userId, provider);
        if (billCount > 0 || scheduleCount > 0) {
            if (reassignTo == null) {
                throw ApiException.conflict("provider_in_use",
                        "\"" + provider.getName() + "\" is still used. Choose another provider to move its bills to.",
                        Map.of("billCount", billCount, "scheduleCount", scheduleCount));
            }
            if (reassignTo.equals(id)) {
                throw ApiException.badRequest("invalid_reassignment", "Choose a different provider to move bills to.");
            }
            Provider target = providers.findByIdAndUserId(reassignTo, userId)
                    .orElseThrow(() -> ApiException.badRequest("invalid_reassignment",
                            "The provider to move bills to wasn't found."));
            Instant now = Instant.now();
            bills.reassignProvider(userId, provider, target, now);
            schedules.reassignProvider(userId, provider, target, now);
        }
        providers.delete(providers.getReferenceById(id));
    }

    private Category defaultCategory(UUID userId, ProviderRequest request) {
        if (request.defaultCategoryId() == null) {
            return null;
        }
        return categories.findByIdAndUserId(request.defaultCategoryId(), userId)
                .orElseThrow(() -> ApiException.invalidField("defaultCategoryId", "Choose one of your categories."));
    }

    private static ProviderResponse toResponse(Provider provider, long billCount, long scheduleCount) {
        Category category = provider.getDefaultCategory();
        NamedRef categoryRef = category == null ? null : new NamedRef(category.getId(), category.getName());
        return new ProviderResponse(provider.getId(), provider.getName(), categoryRef, billCount, scheduleCount);
    }
}
