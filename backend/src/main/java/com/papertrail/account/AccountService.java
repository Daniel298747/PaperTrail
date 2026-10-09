package com.papertrail.account;

import java.util.Locale;
import java.util.UUID;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.papertrail.account.dto.AccountRequests.ChangePasswordRequest;
import com.papertrail.account.dto.AccountRequests.UpdateAccountRequest;
import com.papertrail.account.dto.AccountResponse;
import com.papertrail.auth.RefreshTokenService;
import com.papertrail.bill.BillRepository;
import com.papertrail.common.ApiException;
import com.papertrail.common.Money;
import com.papertrail.schedule.ScheduleRepository;

@Service
public class AccountService {

    private final UserRepository users;
    private final BillRepository bills;
    private final ScheduleRepository schedules;
    private final PasswordEncoder passwordEncoder;
    private final RefreshTokenService refreshTokens;
    private final HouseholdTime time;

    public AccountService(UserRepository users, BillRepository bills, ScheduleRepository schedules,
            PasswordEncoder passwordEncoder, RefreshTokenService refreshTokens, HouseholdTime time) {
        this.users = users;
        this.bills = bills;
        this.schedules = schedules;
        this.passwordEncoder = passwordEncoder;
        this.refreshTokens = refreshTokens;
        this.time = time;
    }

    public User require(UUID userId) {
        return users.findById(userId)
                .orElseThrow(() -> ApiException.unauthorized("account_missing", "This account no longer exists."));
    }

    @Transactional(readOnly = true)
    public AccountResponse get(UUID userId) {
        return describe(require(userId));
    }

    public AccountResponse describe(User user) {
        return AccountResponse.from(user, time.today(user), currencyLocked(user.getId()));
    }

    @Transactional
    public AccountResponse update(UUID userId, UpdateAccountRequest request) {
        User user = require(userId);
        if (request.displayName() != null) {
            String name = request.displayName().trim();
            if (name.isEmpty()) {
                throw ApiException.invalidField("displayName", "Enter a name.");
            }
            user.setDisplayName(name);
        }
        if (request.timezone() != null) {
            user.setTimezone(Timezones.require(request.timezone(), "timezone"));
        }
        if (request.currency() != null) {
            String code = request.currency().trim().toUpperCase(Locale.ROOT);
            if (!Money.isValidCurrency(code)) {
                throw ApiException.invalidField("currency", "Use a valid ISO 4217 currency code, such as EUR.");
            }
            if (!code.equals(user.getCurrency())) {
                if (currencyLocked(userId)) {
                    throw ApiException.conflict("currency_locked",
                            "The currency can't change once bills or schedules exist, so totals never mix currencies.");
                }
                user.setCurrency(code);
            }
        }
        if (request.defaultReminderLeadDays() != null) {
            user.setDefaultReminderLeadDays(request.defaultReminderLeadDays());
        }
        users.saveAndFlush(user);
        return describe(user);
    }

    /** @param currentSessionId refresh-token family of the caller's session, which stays signed in */
    @Transactional
    public void changePassword(UUID userId, ChangePasswordRequest request, UUID currentSessionId) {
        User user = require(userId);
        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            throw ApiException.invalidField("currentPassword", "That isn't your current password.");
        }
        PasswordPolicy.check(request.newPassword(), "newPassword");
        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        refreshTokens.revokeOtherSessions(userId, currentSessionId);
    }

    private boolean currencyLocked(UUID userId) {
        return bills.existsByUserId(userId) || schedules.existsByUserId(userId);
    }
}
