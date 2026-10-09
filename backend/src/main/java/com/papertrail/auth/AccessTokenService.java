package com.papertrail.auth;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

import com.papertrail.account.User;
import com.papertrail.config.AppProperties;

@Service
public class AccessTokenService {

    public static final String SESSION_CLAIM = "sid";

    private final JwtEncoder encoder;
    private final Clock clock;
    private final AppProperties.Jwt settings;

    public AccessTokenService(JwtEncoder encoder, Clock clock, AppProperties properties) {
        this.encoder = encoder;
        this.clock = clock;
        this.settings = properties.jwt();
    }

    /**
     * @param sessionId the refresh-token family this access token belongs to ("sid" claim), so account
     *                  actions such as a password change can tell the current session from the others
     */
    public IssuedAccessToken issue(User user, UUID sessionId) {
        Instant now = clock.instant();
        Instant expiresAt = now.plus(settings.accessTokenTtl());
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(settings.issuer())
                .subject(user.getId().toString())
                .issuedAt(now)
                .expiresAt(expiresAt)
                .id(UUID.randomUUID().toString())
                .claim(SESSION_CLAIM, sessionId.toString())
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).type("JWT").build();
        String value = encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
        return new IssuedAccessToken(value, expiresAt);
    }

    public record IssuedAccessToken(String value, Instant expiresAt) {
    }
}
