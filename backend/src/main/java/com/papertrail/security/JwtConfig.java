package com.papertrail.security;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

import com.papertrail.config.AppProperties;

@Configuration
public class JwtConfig {

    private static final Logger log = LoggerFactory.getLogger(JwtConfig.class);
    private static final int MIN_KEY_BYTES = 32;

    /**
     * HS256 signing key from APP_JWT_SECRET (base64, at least 256 bits). Outside the prod profile a
     * missing secret falls back to a random per-process key: access tokens then stop validating after a
     * restart, and the browser silently obtains a new one with its refresh cookie.
     */
    @Bean
    public SecretKey jwtSigningKey(AppProperties properties, Environment environment) {
        String secret = properties.jwt().secret();
        if (secret == null || secret.isBlank()) {
            if (environment.acceptsProfiles(Profiles.of("prod"))) {
                throw new IllegalStateException("APP_JWT_SECRET must be set when the prod profile is active.");
            }
            log.warn("APP_JWT_SECRET is not set; using an ephemeral signing key for this process (development only).");
            byte[] random = new byte[MIN_KEY_BYTES];
            new SecureRandom().nextBytes(random);
            return new SecretKeySpec(random, "HmacSHA256");
        }
        byte[] keyBytes = decode(secret.trim());
        if (keyBytes.length < MIN_KEY_BYTES) {
            throw new IllegalStateException("APP_JWT_SECRET must decode to at least 32 bytes (256 bits).");
        }
        return new SecretKeySpec(keyBytes, "HmacSHA256");
    }

    @Bean
    public JwtEncoder jwtEncoder(SecretKey jwtSigningKey) {
        return NimbusJwtEncoder.withSecretKey(jwtSigningKey).algorithm(MacAlgorithm.HS256).build();
    }

    @Bean
    public JwtDecoder jwtDecoder(SecretKey jwtSigningKey, AppProperties properties, Clock clock) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(jwtSigningKey).macAlgorithm(MacAlgorithm.HS256)
                .build();
        JwtTimestampValidator timestamps = new JwtTimestampValidator(Duration.ofSeconds(30));
        timestamps.setClock(clock);
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(timestamps,
                new JwtIssuerValidator(properties.jwt().issuer())));
        return decoder;
    }

    private static byte[] decode(String secret) {
        try {
            return Base64.getDecoder().decode(secret);
        } catch (IllegalArgumentException notBase64) {
            return secret.getBytes(StandardCharsets.UTF_8);
        }
    }
}
