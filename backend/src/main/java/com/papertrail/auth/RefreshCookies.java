package com.papertrail.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;
import org.springframework.web.util.WebUtils;

import com.papertrail.config.AppProperties;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;

/** The refresh cookie: HttpOnly, path-scoped to /api/auth, SameSite and Secure from configuration. */
@Component
public class RefreshCookies {

    static final String PATH = "/api/auth";

    private final AppProperties.Refresh settings;
    private final Clock clock;

    public RefreshCookies(AppProperties properties, Clock clock) {
        this.settings = properties.refresh();
        this.clock = clock;
    }

    public String read(HttpServletRequest request) {
        Cookie cookie = WebUtils.getCookie(request, settings.cookieName());
        return cookie == null ? null : cookie.getValue();
    }

    public ResponseCookie issue(String value, Instant expiresAt) {
        Duration maxAge = Duration.between(clock.instant(), expiresAt);
        return base(value).maxAge(maxAge.isNegative() ? Duration.ZERO : maxAge).build();
    }

    public ResponseCookie clear() {
        return base("").maxAge(Duration.ZERO).build();
    }

    private ResponseCookie.ResponseCookieBuilder base(String value) {
        return ResponseCookie.from(settings.cookieName(), value)
                .httpOnly(true)
                .secure(settings.cookieSecure())
                .sameSite(settings.cookieSameSite())
                .path(PATH);
    }
}
