package com.papertrail.bill;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.data.jpa.domain.Specification;

import jakarta.persistence.criteria.Predicate;

final class BillSpecifications {

    private BillSpecifications() {
    }

    /** Always scoped to one household; every other predicate narrows within it. */
    static Specification<Bill> matching(UUID userId, BillFilter filter, LocalDate today) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("userId"), userId));
            if (filter.text() != null && !filter.text().isBlank()) {
                String pattern = "%" + escapeLike(filter.text().trim().toLowerCase(Locale.ROOT)) + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("title")), pattern, '\\'),
                        cb.like(cb.lower(root.get("provider").get("name")), pattern, '\\'),
                        cb.like(cb.lower(root.get("category").get("name")), pattern, '\\'),
                        cb.like(cb.lower(root.get("notes")), pattern, '\\')));
            }
            if (filter.status() != null) {
                switch (filter.status()) {
                    case OUTSTANDING -> predicates.add(cb.equal(root.get("status"), PaymentStatus.UNPAID));
                    case UNPAID -> {
                        predicates.add(cb.equal(root.get("status"), PaymentStatus.UNPAID));
                        predicates.add(cb.greaterThanOrEqualTo(root.get("dueDate"), today));
                    }
                    case OVERDUE -> {
                        predicates.add(cb.equal(root.get("status"), PaymentStatus.UNPAID));
                        predicates.add(cb.lessThan(root.get("dueDate"), today));
                    }
                    case PAID -> predicates.add(cb.equal(root.get("status"), PaymentStatus.PAID));
                }
            }
            if (filter.providerId() != null) {
                predicates.add(cb.equal(root.get("provider").get("id"), filter.providerId()));
            }
            if (filter.categoryId() != null) {
                predicates.add(cb.equal(root.get("category").get("id"), filter.categoryId()));
            }
            if (filter.scheduleId() != null) {
                predicates.add(cb.equal(root.get("schedule").get("id"), filter.scheduleId()));
            }
            if (filter.dueFrom() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("dueDate"), filter.dueFrom()));
            }
            if (filter.dueTo() != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("dueDate"), filter.dueTo()));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    static String escapeLike(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
