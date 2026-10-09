package com.papertrail.auth;

import java.util.Locale;
import java.util.Optional;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.papertrail.account.AccountService;
import com.papertrail.account.PasswordPolicy;
import com.papertrail.account.Timezones;
import com.papertrail.account.User;
import com.papertrail.account.UserRepository;
import com.papertrail.account.dto.AccountResponse;
import com.papertrail.auth.AccessTokenService.IssuedAccessToken;
import com.papertrail.auth.RefreshTokenService.IssuedRefreshToken;
import com.papertrail.auth.dto.AuthDtos.LoginRequest;
import com.papertrail.auth.dto.AuthDtos.RegisterRequest;
import com.papertrail.category.CategoryService;
import com.papertrail.common.ApiException;
import com.papertrail.common.Money;

@Service
public class AuthService {

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final AccessTokenService accessTokens;
    private final RefreshTokenService refreshTokens;
    private final CategoryService categories;
    private final AccountService accounts;
    /** Compared against when the email is unknown, so response time doesn't reveal which emails exist. */
    private final String timingDummyHash;

    public AuthService(UserRepository users, PasswordEncoder passwordEncoder, AccessTokenService accessTokens,
            RefreshTokenService refreshTokens, CategoryService categories, AccountService accounts) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.accessTokens = accessTokens;
        this.refreshTokens = refreshTokens;
        this.categories = categories;
        this.accounts = accounts;
        this.timingDummyHash = passwordEncoder.encode("timing-equalisation-placeholder");
    }

    @Transactional
    public Session register(RegisterRequest request, String userAgent) {
        String email = normaliseEmail(request.email());
        PasswordPolicy.check(request.password(), "password");
        String timezone = Timezones.orDefault(request.timezone(), "timezone");
        String currency = request.currency() == null || request.currency().isBlank() ? "EUR"
                : request.currency().trim().toUpperCase(Locale.ROOT);
        if (!Money.isValidCurrency(currency)) {
            throw ApiException.invalidField("currency", "Use a valid ISO 4217 currency code, such as EUR.");
        }
        if (users.existsByEmailIgnoreCase(email)) {
            throw ApiException.conflict("email_taken", "An account with this email already exists.");
        }
        User user = users.saveAndFlush(new User(email, passwordEncoder.encode(request.password()),
                request.displayName().trim(), currency, timezone));
        categories.createStarterCategories(user.getId());
        return open(user, null, userAgent);
    }

    @Transactional
    public Session login(LoginRequest request, String userAgent) {
        Optional<User> user = users.findByEmailIgnoreCase(normaliseEmail(request.email()));
        if (user.isEmpty()) {
            passwordEncoder.matches(request.password(), timingDummyHash);
            throw invalidCredentials();
        }
        if (!passwordEncoder.matches(request.password(), user.get().getPasswordHash())) {
            throw invalidCredentials();
        }
        return open(user.get(), null, userAgent);
    }

    @Transactional(noRollbackFor = ApiException.class)
    public Session refresh(String rawRefreshToken, String userAgent) {
        RefreshTokenService.Rotation rotation = refreshTokens.rotate(rawRefreshToken, userAgent);
        User user = users.findById(rotation.userId())
                .orElseThrow(() -> ApiException.unauthorized("session_invalid", "Sign in to continue."));
        return new Session(accessTokens.issue(user, rotation.token().familyId()), rotation.token(),
                accounts.describe(user));
    }

    @Transactional
    public void logout(String rawRefreshToken) {
        refreshTokens.revokeSession(rawRefreshToken);
    }

    private Session open(User user, java.util.UUID familyId, String userAgent) {
        IssuedRefreshToken refresh = refreshTokens.issue(user.getId(), familyId, userAgent);
        return new Session(accessTokens.issue(user, refresh.familyId()), refresh, accounts.describe(user));
    }

    private static String normaliseEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    private static ApiException invalidCredentials() {
        return ApiException.unauthorized("invalid_credentials", "That email and password don't match an account.");
    }

    public record Session(IssuedAccessToken accessToken, IssuedRefreshToken refreshToken, AccountResponse account) {
    }
}
