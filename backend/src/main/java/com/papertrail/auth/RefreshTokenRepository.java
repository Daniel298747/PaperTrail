package com.papertrail.auth;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, UUID> {

    /** Row lock so two simultaneous refreshes with the same token are serialised. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from RefreshToken t where t.tokenHash = :hash")
    Optional<RefreshToken> findByTokenHashForUpdate(@Param("hash") String hash);

    Optional<RefreshToken> findByTokenHash(String hash);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update RefreshToken t set t.revokedAt = :now, t.revokedReason = :reason
            where t.familyId = :familyId and t.revokedAt is null""")
    int revokeFamily(@Param("familyId") UUID familyId, @Param("now") Instant now,
            @Param("reason") RefreshToken.RevokedReason reason);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update RefreshToken t set t.revokedAt = :now, t.revokedReason = :reason
            where t.userId = :userId and t.revokedAt is null and t.familyId <> :keepFamilyId""")
    int revokeAllForUserExceptFamily(@Param("userId") UUID userId, @Param("keepFamilyId") UUID keepFamilyId,
            @Param("now") Instant now, @Param("reason") RefreshToken.RevokedReason reason);

    @Modifying
    @Query("delete from RefreshToken t where t.expiresAt < :cutoff")
    int deleteExpiredBefore(@Param("cutoff") Instant cutoff);
}
