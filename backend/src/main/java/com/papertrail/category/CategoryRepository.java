package com.papertrail.category;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CategoryRepository extends JpaRepository<Category, UUID> {

    List<Category> findByUserIdOrderByNameAsc(UUID userId);

    Optional<Category> findByIdAndUserId(UUID id, UUID userId);

    @Query("select count(c) > 0 from Category c where c.userId = :userId and lower(c.name) = lower(:name)")
    boolean existsByName(@Param("userId") UUID userId, @Param("name") String name);

    @Query("""
            select count(c) > 0 from Category c
            where c.userId = :userId and lower(c.name) = lower(:name) and c.id <> :excludeId""")
    boolean existsByNameExcluding(@Param("userId") UUID userId, @Param("name") String name,
            @Param("excludeId") UUID excludeId);
}
