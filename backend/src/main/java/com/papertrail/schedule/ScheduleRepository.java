package com.papertrail.schedule;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.papertrail.category.Category;
import com.papertrail.provider.Provider;

public interface ScheduleRepository extends JpaRepository<RecurringBillSchedule, UUID> {

    @EntityGraph(attributePaths = { "provider", "category" })
    List<RecurringBillSchedule> findByUserIdOrderByActiveDescTitleAsc(UUID userId);

    @EntityGraph(attributePaths = { "provider", "category" })
    Optional<RecurringBillSchedule> findByIdAndUserId(UUID id, UUID userId);

    @EntityGraph(attributePaths = { "provider", "category" })
    @Query("select s from RecurringBillSchedule s where s.id = :id")
    Optional<RecurringBillSchedule> findWithReferencesById(@Param("id") UUID id);

    @Query("select s.id from RecurringBillSchedule s where s.active = true order by s.id")
    List<UUID> findActiveIds();

    @Query("select s.id from RecurringBillSchedule s where s.active = true and s.userId = :userId order by s.id")
    List<UUID> findActiveIdsByUser(@Param("userId") UUID userId);

    boolean existsByUserId(UUID userId);

    @Query("select s.category.id, count(s) from RecurringBillSchedule s where s.userId = :userId group by s.category.id")
    List<Object[]> countByCategory(@Param("userId") UUID userId);

    @Query("select s.provider.id, count(s) from RecurringBillSchedule s where s.userId = :userId group by s.provider.id")
    List<Object[]> countByProvider(@Param("userId") UUID userId);

    long countByUserIdAndCategory(UUID userId, Category category);

    long countByUserIdAndProvider(UUID userId, Provider provider);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update RecurringBillSchedule s set s.category = :target, s.updatedAt = :now
            where s.userId = :userId and s.category = :source""")
    int reassignCategory(@Param("userId") UUID userId, @Param("source") Category source,
            @Param("target") Category target, @Param("now") Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update RecurringBillSchedule s set s.provider = :target, s.updatedAt = :now
            where s.userId = :userId and s.provider = :source""")
    int reassignProvider(@Param("userId") UUID userId, @Param("source") Provider source,
            @Param("target") Provider target, @Param("now") Instant now);
}
