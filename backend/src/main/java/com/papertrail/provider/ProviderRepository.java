package com.papertrail.provider;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProviderRepository extends JpaRepository<Provider, UUID> {

    @EntityGraph(attributePaths = "defaultCategory")
    List<Provider> findByUserIdOrderByNameAsc(UUID userId);

    @EntityGraph(attributePaths = "defaultCategory")
    Optional<Provider> findByIdAndUserId(UUID id, UUID userId);

    @Query("select count(p) > 0 from Provider p where p.userId = :userId and lower(p.name) = lower(:name)")
    boolean existsByName(@Param("userId") UUID userId, @Param("name") String name);

    @Query("""
            select count(p) > 0 from Provider p
            where p.userId = :userId and lower(p.name) = lower(:name) and p.id <> :excludeId""")
    boolean existsByNameExcluding(@Param("userId") UUID userId, @Param("name") String name,
            @Param("excludeId") UUID excludeId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update Provider p set p.defaultCategory = null where p.userId = :userId and p.defaultCategory.id = :categoryId")
    int clearDefaultCategory(@Param("userId") UUID userId, @Param("categoryId") UUID categoryId);
}
