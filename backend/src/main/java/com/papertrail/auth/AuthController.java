package com.papertrail.auth;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.papertrail.auth.AuthService.Session;
import com.papertrail.auth.dto.AuthDtos.AuthResponse;
import com.papertrail.auth.dto.AuthDtos.CsrfResponse;
import com.papertrail.auth.dto.AuthDtos.LoginRequest;
import com.papertrail.auth.dto.AuthDtos.RegisterRequest;
import com.papertrail.common.ApiException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService auth;
    private final RefreshCookies refreshCookies;

    public AuthController(AuthService auth, RefreshCookies refreshCookies) {
        this.auth = auth;
        this.refreshCookies = refreshCookies;
    }

    /**
     * Issues the CSRF token required by the cookie-authenticated POST endpoints below. The token cookie is
     * HttpOnly; the client sends the (masked) value from this response in the X-XSRF-TOKEN header.
     */
    @GetMapping("/csrf")
    public CsrfResponse csrf(CsrfToken token) {
        return new CsrfResponse(token.getHeaderName(), token.getToken());
    }

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request,
            HttpServletRequest httpRequest) {
        return respond(HttpStatus.CREATED, auth.register(request, httpRequest.getHeader(HttpHeaders.USER_AGENT)));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest) {
        return respond(HttpStatus.OK, auth.login(request, httpRequest.getHeader(HttpHeaders.USER_AGENT)));
    }

    /**
     * Exchanges the refresh cookie for a new access token (rotating the cookie). With no cookie at all
     * there is simply no session to resume: 204, which lets the SPA probe for a session on page load
     * without an error. A cookie that is invalid, expired or revoked is a 401.
     */
    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(HttpServletRequest httpRequest) {
        String rawToken = refreshCookies.read(httpRequest);
        if (rawToken == null || rawToken.isBlank()) {
            return ResponseEntity.noContent().header(HttpHeaders.CACHE_CONTROL, "no-store").build();
        }
        try {
            return respond(HttpStatus.OK, auth.refresh(rawToken, httpRequest.getHeader(HttpHeaders.USER_AGENT)));
        } catch (ApiException e) {
            if (e.getStatus() == HttpStatus.UNAUTHORIZED && !"session_superseded".equals(e.getCode())) {
                // Dead session: clear the cookie. ("superseded" means another tab holds a newer cookie.)
                e.withHeader(HttpHeaders.SET_COOKIE, refreshCookies.clear().toString());
            }
            throw e;
        }
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest httpRequest) {
        auth.logout(refreshCookies.read(httpRequest));
        return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, refreshCookies.clear().toString()).build();
    }

    private ResponseEntity<AuthResponse> respond(HttpStatus status, Session session) {
        AuthResponse body = new AuthResponse(session.accessToken().value(), "Bearer",
                session.accessToken().expiresAt(), session.account());
        return ResponseEntity.status(status)
                .header(HttpHeaders.SET_COOKIE, refreshCookies.issue(session.refreshToken().value(),
                        session.refreshToken().expiresAt()).toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(body);
    }
}
