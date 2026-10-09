package com.papertrail.account;

import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.papertrail.account.dto.AccountRequests.ChangePasswordRequest;
import com.papertrail.account.dto.AccountRequests.UpdateAccountRequest;
import com.papertrail.account.dto.AccountResponse;
import com.papertrail.security.AuthUser;
import com.papertrail.security.CurrentUser;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/account")
@Validated
public class AccountController {

    private final AccountService accounts;

    public AccountController(AccountService accounts) {
        this.accounts = accounts;
    }

    @GetMapping
    public AccountResponse get(@CurrentUser AuthUser user) {
        return accounts.get(user.id());
    }

    @PatchMapping
    public AccountResponse update(@CurrentUser AuthUser user, @Valid @RequestBody UpdateAccountRequest request) {
        return accounts.update(user.id(), request);
    }

    /**
     * Changes the password and signs out every other device. The current session (identified by the
     * access token's session claim, since the refresh cookie is scoped to /api/auth) stays signed in.
     */
    @PostMapping("/password")
    public ResponseEntity<Void> changePassword(@CurrentUser AuthUser user,
            @Valid @RequestBody ChangePasswordRequest request) {
        accounts.changePassword(user.id(), request, user.sessionId());
        return ResponseEntity.noContent().build();
    }
}
