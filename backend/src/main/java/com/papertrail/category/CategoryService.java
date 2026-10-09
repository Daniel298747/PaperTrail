package com.papertrail.category;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.papertrail.bill.BillRepository;
import com.papertrail.category.dto.CategoryDtos.CategoryRequest;
import com.papertrail.category.dto.CategoryDtos.CategoryResponse;
import com.papertrail.common.ApiException;
import com.papertrail.common.UsageCounts;
import com.papertrail.provider.ProviderRepository;
import com.papertrail.schedule.ScheduleRepository;

@Service
public class CategoryService {

    /** Created for every new household; all can be renamed or removed. */
    public static final List<String> STARTER_CATEGORIES = List.of(
            "Electricity", "Gas", "Broadband", "Mobile", "Insurance", "Rent", "Water", "Subscriptions");

    private final CategoryRepository categories;
    private final BillRepository bills;
    private final ScheduleRepository schedules;
    private final ProviderRepository providers;

    public CategoryService(CategoryRepository categories, BillRepository bills, ScheduleRepository schedules,
            ProviderRepository providers) {
        this.categories = categories;
        this.bills = bills;
        this.schedules = schedules;
        this.providers = providers;
    }

    @Transactional
    public void createStarterCategories(UUID userId) {
        STARTER_CATEGORIES.forEach(name -> categories.save(new Category(userId, name)));
    }

    public Category require(UUID userId, UUID id) {
        return categories.findByIdAndUserId(id, userId).orElseThrow(() -> ApiException.notFound("Category"));
    }

    @Transactional(readOnly = true)
    public List<CategoryResponse> list(UUID userId) {
        Map<UUID, Long> billCounts = UsageCounts.toMap(bills.countByCategory(userId));
        Map<UUID, Long> scheduleCounts = UsageCounts.toMap(schedules.countByCategory(userId));
        return categories.findByUserIdOrderByNameAsc(userId).stream()
                .map(c -> new CategoryResponse(c.getId(), c.getName(), billCounts.getOrDefault(c.getId(), 0L),
                        scheduleCounts.getOrDefault(c.getId(), 0L)))
                .toList();
    }

    @Transactional
    public CategoryResponse create(UUID userId, CategoryRequest request) {
        String name = request.name().trim();
        if (categories.existsByName(userId, name)) {
            throw ApiException.conflict("category_exists", "You already have a category called \"" + name + "\".");
        }
        Category category = categories.saveAndFlush(new Category(userId, name));
        return new CategoryResponse(category.getId(), category.getName(), 0, 0);
    }

    @Transactional
    public CategoryResponse rename(UUID userId, UUID id, CategoryRequest request) {
        Category category = require(userId, id);
        String name = request.name().trim();
        if (categories.existsByNameExcluding(userId, name, id)) {
            throw ApiException.conflict("category_exists", "You already have a category called \"" + name + "\".");
        }
        category.setName(name);
        categories.saveAndFlush(category);
        return new CategoryResponse(category.getId(), category.getName(),
                bills.countByUserIdAndCategory(userId, category), schedules.countByUserIdAndCategory(userId, category));
    }

    /**
     * Deleting a category that bills or schedules still use requires an explicit {@code reassignTo}
     * target; without one the request is refused with the usage counts so the UI can ask.
     */
    @Transactional
    public void delete(UUID userId, UUID id, UUID reassignTo) {
        Category category = require(userId, id);
        long billCount = bills.countByUserIdAndCategory(userId, category);
        long scheduleCount = schedules.countByUserIdAndCategory(userId, category);
        if (billCount > 0 || scheduleCount > 0) {
            if (reassignTo == null) {
                throw ApiException.conflict("category_in_use",
                        "\"" + category.getName() + "\" is still used. Choose another category to move its bills to.",
                        Map.of("billCount", billCount, "scheduleCount", scheduleCount));
            }
            if (reassignTo.equals(id)) {
                throw ApiException.badRequest("invalid_reassignment", "Choose a different category to move bills to.");
            }
            Category target = categories.findByIdAndUserId(reassignTo, userId)
                    .orElseThrow(() -> ApiException.badRequest("invalid_reassignment",
                            "The category to move bills to wasn't found."));
            Instant now = Instant.now();
            bills.reassignCategory(userId, category, target, now);
            schedules.reassignCategory(userId, category, target, now);
        }
        providers.clearDefaultCategory(userId, id);
        categories.delete(categories.getReferenceById(id));
    }
}
