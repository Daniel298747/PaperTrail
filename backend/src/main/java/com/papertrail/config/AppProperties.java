package com.papertrail.config;

import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.unit.DataSize;

/**
 * Typed application settings. Defaults live in application.yml; every value can be overridden
 * through environment variables (see .env.example and the README).
 */
@ConfigurationProperties(prefix = "app")
public record AppProperties(
        Jwt jwt,
        Refresh refresh,
        PasswordHashing passwordHashing,
        Cors cors,
        Storage storage,
        Uploads uploads,
        Jobs jobs,
        Seed seed) {

    /** Access tokens: short-lived HS256 JWTs kept in browser memory. */
    public record Jwt(String secret, String issuer, Duration accessTokenTtl) {
    }

    /** BCrypt work factor. 12 in production; tests lower it to keep the suite fast. */
    public record PasswordHashing(int bcryptStrength) {
    }

    /** Refresh sessions: opaque random tokens in an HttpOnly cookie, stored hashed in the database. */
    public record Refresh(
            Duration ttl,
            String cookieName,
            boolean cookieSecure,
            String cookieSameSite,
            Duration reuseGracePeriod) {
    }

    public record Cors(List<String> allowedOrigins) {
    }

    /**
     * S3-compatible document storage. {@code endpoint} is how the API reaches the store;
     * {@code publicEndpoint} is the host embedded in signed URLs that browsers open.
     */
    public record Storage(
            String provider,
            String bucket,
            String region,
            String endpoint,
            String publicEndpoint,
            boolean pathStyleAccess,
            String accessKey,
            String secretKey,
            boolean createBucket,
            Duration presignTtl) {
    }

    public record Uploads(DataSize maxFileSize) {
    }

    public record Jobs(boolean enabled, String cron, int horizonDays, boolean runOnStartup) {
    }

    public record Seed(boolean demo, boolean exitAfterSeed, String demoEmail, String demoPassword) {
    }
}
