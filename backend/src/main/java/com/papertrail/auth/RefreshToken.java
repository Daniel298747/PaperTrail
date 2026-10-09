package com.papertrail.auth;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Server-side record of a refresh token. Only the SHA-256 hash of the token is stored. */
@Entity
@Table(name = "refresh_tokens")
public class RefreshToken {

    public enum RevokedReason {
        ROTATED, LOGOUT, REUSE_DETECTED, PASSWORD_CHANGED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "token_hash", nullable = false, length = 64)
    private String tokenHash;

    @Column(name = "family_id", nullable = false, updatable = false)
    private UUID familyId;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "revoked_reason", length = 20)
    private RevokedReason revokedReason;

    @Column(name = "user_agent", length = 255)
    private String userAgent;

    protected RefreshToken() {
    }

    public RefreshToken(UUID userId, String tokenHash, UUID familyId, Instant createdAt, Instant expiresAt,
            String userAgent) {
        this.userId = userId;
        this.tokenHash = tokenHash;
        this.familyId = familyId;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
        this.userAgent = userAgent;
    }

    public boolean isRevoked() {
        return revokedAt != null;
    }

    public boolean isExpired(Instant now) {
        return !expiresAt.isAfter(now);
    }

    public void revoke(Instant at, RevokedReason reason) {
        if (revokedAt == null) {
            revokedAt = at;
            revokedReason = reason;
        }
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public UUID getFamilyId() {
        return familyId;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }

    public RevokedReason getRevokedReason() {
        return revokedReason;
    }
}
