package com.papertrail.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.papertrail.auth.RefreshToken.RevokedReason;
import com.papertrail.common.ApiException;
import com.papertrail.config.AppProperties;

/**
 * Refresh sessions with rotation. Every refresh revokes the presented token and issues a successor in the
 * same family. Presenting an already-rotated token after the grace window is treated as theft: the whole
 * family is revoked. The short grace window absorbs two browser tabs refreshing at the same moment.
 */
@Service
public class RefreshTokenService {

    private static final Logger log = LoggerFactory.getLogger(RefreshTokenService.class);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final RefreshTokenRepository tokens;
    private final Clock clock;
    private final AppProperties.Refresh settings;

    public RefreshTokenService(RefreshTokenRepository tokens, Clock clock, AppProperties properties) {
        this.tokens = tokens;
        this.clock = clock;
        this.settings = properties.refresh();
    }

    @Transactional
    public IssuedRefreshToken issue(UUID userId, UUID familyId, String userAgent) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        Instant now = clock.instant();
        Instant expiresAt = now.plus(settings.ttl());
        UUID family = familyId == null ? UUID.randomUUID() : familyId;
        tokens.save(new RefreshToken(userId, hash(raw), family, now, expiresAt, truncate(userAgent)));
        return new IssuedRefreshToken(raw, expiresAt, family);
    }

    /** Validates and rotates. Failures are committed (family revocation must stick), hence noRollbackFor. */
    @Transactional(noRollbackFor = ApiException.class)
    public Rotation rotate(String raw, String userAgent) {
        if (raw == null || raw.isBlank()) {
            throw ApiException.unauthorized("session_missing", "Sign in to continue.");
        }
        RefreshToken token = tokens.findByTokenHashForUpdate(hash(raw))
                .orElseThrow(() -> ApiException.unauthorized("session_invalid", "Sign in to continue."));
        Instant now = clock.instant();
        if (token.isRevoked()) {
            boolean rotated = token.getRevokedReason() == RevokedReason.ROTATED;
            if (rotated && token.getRevokedAt().plus(settings.reuseGracePeriod()).isAfter(now)) {
                throw ApiException.unauthorized("session_superseded",
                        "This session was just refreshed elsewhere. Retry with the latest cookie.");
            }
            if (rotated) {
                log.warn("Refresh token reuse detected for user {}; revoking session family {}", token.getUserId(),
                        token.getFamilyId());
                tokens.revokeFamily(token.getFamilyId(), now, RevokedReason.REUSE_DETECTED);
            }
            throw ApiException.unauthorized("session_revoked", "Your session has ended. Sign in again.");
        }
        if (token.isExpired(now)) {
            throw ApiException.unauthorized("session_expired", "Your session has expired. Sign in again.");
        }
        token.revoke(now, RevokedReason.ROTATED);
        IssuedRefreshToken next = issue(token.getUserId(), token.getFamilyId(), userAgent);
        return new Rotation(token.getUserId(), next);
    }

    /** Logout: ends the whole session family the presented token belongs to. */
    @Transactional
    public void revokeSession(String raw) {
        if (raw == null || raw.isBlank()) {
            return;
        }
        tokens.findByTokenHash(hash(raw))
                .ifPresent(token -> tokens.revokeFamily(token.getFamilyId(), clock.instant(), RevokedReason.LOGOUT));
    }

    /** After a password change: every other device has to sign in again. */
    @Transactional
    public void revokeOtherSessions(UUID userId, UUID keepFamilyId) {
        UUID keep = keepFamilyId == null ? new UUID(0, 0) : keepFamilyId;
        tokens.revokeAllForUserExceptFamily(userId, keep, clock.instant(), RevokedReason.PASSWORD_CHANGED);
    }

    @Transactional
    public int purgeExpired(Instant cutoff) {
        return tokens.deleteExpiredBefore(cutoff);
    }

    static String hash(String raw) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(raw.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String truncate(String value) {
        if (value == null) {
            return null;
        }
        return value.length() <= 255 ? value : value.substring(0, 255);
    }

    public record IssuedRefreshToken(String value, Instant expiresAt, UUID familyId) {
    }

    public record Rotation(UUID userId, IssuedRefreshToken token) {
    }
}
