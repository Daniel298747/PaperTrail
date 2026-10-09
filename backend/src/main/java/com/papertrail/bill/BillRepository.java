package com.papertrail.bill;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.papertrail.category.Category;
import com.papertrail.provider.Provider;

import jakarta.persistence.LockModeType;

public interface BillRepository extends JpaRepository<Bill, UUID>, JpaSpecificationExecutor<Bill> {

    @Override
    @EntityGraph(attributePaths = { "provider", "category", "schedule" })
    Page<Bill> findAll(Specification<Bill> spec, Pageable pageable);

    @EntityGraph(attributePaths = { "provider", "category", "schedule" })
    Optional<Bill> findByIdAndUserId(UUID id, UUID userId);

    boolean existsByIdAndUserId(UUID id, UUID userId);

    boolean existsByUserId(UUID userId);

    /** Serialises concurrent uploads to the same bill so version numbers stay gap-free. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select b from Bill b where b.id = :id and b.userId = :userId")
    Optional<Bill> findByIdAndUserIdForUpdate(@Param("id") UUID id, @Param("userId") UUID userId);

    @Query("select b.category.id, count(b) from Bill b where b.userId = :userId group by b.category.id")
    List<Object[]> countByCategory(@Param("userId") UUID userId);

    @Query("select b.provider.id, count(b) from Bill b where b.userId = :userId group by b.provider.id")
    List<Object[]> countByProvider(@Param("userId") UUID userId);

    long countByUserIdAndCategory(UUID userId, Category category);

    long countByUserIdAndProvider(UUID userId, Provider provider);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update Bill b set b.category = :target, b.updatedAt = :now
            where b.userId = :userId and b.category = :source""")
    int reassignCategory(@Param("userId") UUID userId, @Param("source") Category source,
            @Param("target") Category target, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update Bill b set b.provider = :target, b.updatedAt = :now
            where b.userId = :userId and b.provider = :source""")
    int reassignProvider(@Param("userId") UUID userId, @Param("source") Provider source,
            @Param("target") Provider target, @Param("now") Instant now);

    @EntityGraph(attributePaths = { "provider", "category", "schedule" })
    @Query("select b from Bill b where b.schedule.id = :scheduleId and b.userId = :userId order by b.dueDate desc")
    List<Bill> findBySchedule(@Param("scheduleId") UUID scheduleId, @Param("userId") UUID userId, Pageable pageable);

    @Query("select count(b) from Bill b where b.schedule.id = :scheduleId")
    long countBySchedule(@Param("scheduleId") UUID scheduleId);

    /** Reminder candidates: unpaid bills whose due date is near (the caller applies each account's timezone). */
    @EntityGraph(attributePaths = { "provider", "category" })
    @Query("""
            select b from Bill b
            where b.status = com.papertrail.bill.PaymentStatus.UNPAID and b.dueDate between :from and :to""")
    List<Bill> findUnpaidDueBetween(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
