package com.papertrail.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import com.papertrail.support.IntegrationTest;

import jakarta.servlet.http.Cookie;

class AuthIntegrationTest extends IntegrationTest {

    @Test
    void registrationReturnsAccessTokenAndHttpOnlyRefreshCookieAndStarterCategories() throws Exception {
        Csrf csrf = csrf();
        MvcResult result = mvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .header(csrf.headerName(), csrf.token()).cookie(csrf.cookie())
                .content(json(Map.of("email", "New.Person@Example.test", "password", PASSWORD,
                        "displayName", "Kelly house", "timezone", "Europe/Dublin"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.account.email").value("new.person@example.test"))
                .andExpect(jsonPath("$.account.currency").value("EUR"))
                .andExpect(jsonPath("$.account.timezone").value("Europe/Dublin"))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andReturn();

        String setCookie = result.getResponse().getHeader("Set-Cookie");
        assertThat(setCookie).contains("pt_refresh=").contains("HttpOnly").contains("Path=/api/auth")
                .contains("SameSite=Strict");
        Session session = session(result, "new.person@example.test");
        getAs(session, "/api/categories").andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(8)));
        // Same email again (case-insensitive) is a conflict.
        Csrf again = csrf();
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                .header(again.headerName(), again.token()).cookie(again.cookie())
                .content(json(Map.of("email", "new.person@EXAMPLE.test", "password", PASSWORD,
                        "displayName", "Dup"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("email_taken"));
    }

    @Test
    void registrationValidatesInputWithFieldErrors() throws Exception {
        Csrf csrf = csrf();
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                .header(csrf.headerName(), csrf.token()).cookie(csrf.cookie())
                .content(json(Map.of("email", "not-an-email", "password", "short", "displayName", ""))))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("validation_failed"))
                .andExpect(jsonPath("$.errors[?(@.field == 'email')]").exists())
                .andExpect(jsonPath("$.errors[?(@.field == 'password')]").exists())
                .andExpect(jsonPath("$.errors[?(@.field == 'displayName')]").exists());
    }

    @Test
    void cookieAuthenticatedEndpointsRequireCsrfToken() throws Exception {
        Session session = register();
        // No CSRF header: rejected before any cookie is honoured.
        mvc.perform(post("/api/auth/refresh").cookie(session.refreshCookie()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("csrf_invalid"));
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("email", session.email(), "password", PASSWORD))))
                .andExpect(status().isForbidden());
    }

    @Test
    void protectedEndpointsRejectMissingAndInvalidTokens() throws Exception {
        mvc.perform(get("/api/bills"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("WWW-Authenticate", containsString("Bearer")))
                .andExpect(jsonPath("$.code").value("unauthenticated"));
        mvc.perform(get("/api/bills").header("Authorization", "Bearer not.a.jwt"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void loginRejectsWrongPasswordAndUnknownEmailIdentically() throws Exception {
        Session session = register();
        Csrf csrf = csrf();
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .header(csrf.headerName(), csrf.token()).cookie(csrf.cookie())
                .content(json(Map.of("email", session.email(), "password", "wrong-password"))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("invalid_credentials"));
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .header(csrf.headerName(), csrf.token()).cookie(csrf.cookie())
                .content(json(Map.of("email", "nobody@example.test", "password", "wrong-password"))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("invalid_credentials"));

        Session again = login(session.email().toUpperCase(), PASSWORD);
        getAs(again, "/api/account").andExpect(status().isOk()).andExpect(jsonPath("$.id").value(session.userId()));
    }

    @Test
    void accessTokensExpireAndTheRefreshCookieIssuesNewOnes() throws Exception {
        Session session = register();
        getAs(session, "/api/account").andExpect(status().isOk());

        clock.advance(Duration.ofMinutes(16));
        getAs(session, "/api/account").andExpect(status().isUnauthorized());

        MvcResult refreshed = refresh(session.refreshCookie()).andExpect(status().isOk()).andReturn();
        Session renewed = session(refreshed, session.email());
        assertThat(renewed.refreshCookie().getValue()).isNotEqualTo(session.refreshCookie().getValue());
        getAs(renewed, "/api/account").andExpect(status().isOk());
    }

    @Test
    void refreshTokenReuseWithinGraceIsSupersededButLaterReuseRevokesTheWholeSession() throws Exception {
        Session session = register();
        Cookie original = session.refreshCookie();
        Cookie rotated = session(refresh(original).andExpect(status().isOk()).andReturn(), session.email())
                .refreshCookie();

        // A second tab replaying the old cookie straight away: refused, but the session survives.
        refresh(original).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("session_superseded"));
        Cookie rotatedAgain = session(refresh(rotated).andExpect(status().isOk()).andReturn(), session.email())
                .refreshCookie();

        // Replaying a rotated token later looks like theft: the entire family is revoked.
        clock.advance(Duration.ofMinutes(5));
        refresh(rotated).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("session_revoked"))
                .andExpect(header().string("Set-Cookie", containsString("Max-Age=0")));
        refresh(rotatedAgain).andExpect(status().isUnauthorized());
    }

    @Test
    void refreshWithoutCookieMeansNoSessionAndAnUnknownCookieIsRejected() throws Exception {
        refresh(null).andExpect(status().isNoContent());
        refresh(new Cookie("pt_refresh", "forged")).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("session_invalid"));
    }

    @Test
    void logoutRevokesTheSessionAndClearsTheCookie() throws Exception {
        Session session = register();
        Csrf csrf = csrf();
        mvc.perform(post("/api/auth/logout").header(csrf.headerName(), csrf.token())
                .cookie(csrf.cookie(), session.refreshCookie()))
                .andExpect(status().isNoContent())
                .andExpect(header().string("Set-Cookie", containsString("Max-Age=0")));
        refresh(session.refreshCookie()).andExpect(status().isUnauthorized());
    }

    @Test
    void passwordChangeSignsOutOtherDevicesButKeepsTheCurrentSession() throws Exception {
        Session laptop = register();
        Session phone = login(laptop.email(), PASSWORD);

        // No cookie here, as in a browser: the refresh cookie is scoped to /api/auth. The access token's
        // session claim identifies which session to keep.
        mvc.perform(authed(post("/api/account/password"), laptop)
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("currentPassword", "nope-nope-nope", "newPassword", "another-good-password"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("currentPassword"));
        mvc.perform(authed(post("/api/account/password"), laptop)
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("currentPassword", PASSWORD, "newPassword", "another-good-password"))))
                .andExpect(status().isNoContent());

        refresh(phone.refreshCookie()).andExpect(status().isUnauthorized());
        refresh(laptop.refreshCookie()).andExpect(status().isOk());
        login(laptop.email(), "another-good-password");
    }

    @Test
    void accountSettingsUpdateAndCurrencyLocksOnceBillsExist() throws Exception {
        Session session = register();
        patchAccount(session, Map.of("timezone", "Mars/Olympus")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("timezone"));
        patchAccount(session, Map.of("currency", "GBP", "timezone", "America/New_York", "defaultReminderLeadDays", 5))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.currency").value("GBP"))
                .andExpect(jsonPath("$.timezone").value("America/New_York"))
                .andExpect(jsonPath("$.defaultReminderLeadDays").value(5))
                .andExpect(jsonPath("$.currencyLocked").value(false));

        String[] refs = providerAndCategory(session);
        createBill(session, refs[0], refs[1], "10.00", today(session));
        patchAccount(session, Map.of("currency", "EUR")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("currency_locked"));
    }

    private org.springframework.test.web.servlet.ResultActions patchAccount(Session session, Map<String, Object> body)
            throws Exception {
        return mvc.perform(authed(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .patch("/api/account"), session).contentType(MediaType.APPLICATION_JSON).content(json(body)));
    }
}
