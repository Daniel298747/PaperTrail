package com.papertrail.document;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DocumentVersionRepository
        extends JpaRepository<BillDocumentVersion, UUID>, JpaSpecificationExecutor<BillDocumentVersion> {

    @Override
    @EntityGraph(attributePaths = { "bill", "bill.provider", "bill.category" })
    Page<BillDocumentVersion> findAll(Specification<BillDocumentVersion> spec, Pageable pageable);

    @Query("""
            select d from BillDocumentVersion d
            where d.bill.id = :billId and d.userId = :userId order by d.versionNumber desc""")
    List<BillDocumentVersion> findVersions(@Param("billId") UUID billId, @Param("userId") UUID userId);

    @EntityGraph(attributePaths = { "bill" })
    Optional<BillDocumentVersion> findByIdAndUserId(UUID id, UUID userId);

    @Query("select coalesce(max(d.versionNumber), 0) from BillDocumentVersion d where d.bill.id = :billId")
    int findMaxVersionNumber(@Param("billId") UUID billId);

    /** [billId, versionCount, latestVersionNumber] for the given bills. */
    @Query("""
            select d.bill.id, count(d), max(d.versionNumber) from BillDocumentVersion d
            where d.bill.id in :billIds group by d.bill.id""")
    List<Object[]> statsByBill(@Param("billIds") Collection<UUID> billIds);

    @Query("select d.storageKey from BillDocumentVersion d where d.bill.id = :billId")
    List<String> findStorageKeysByBill(@Param("billId") UUID billId);

    @Query("select d.storageKey from BillDocumentVersion d where d.userId = :userId")
    List<String> findStorageKeysByUser(@Param("userId") UUID userId);
}
