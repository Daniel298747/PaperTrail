package com.papertrail.account;

import java.nio.charset.StandardCharsets;

import com.papertrail.common.ApiException;

public final class PasswordPolicy {

    private PasswordPolicy() {
    }

    /** BCrypt only reads the first 72 bytes, so longer (multi-byte) passwords are rejected outright. */
    public static void check(String password, String field) {
        if (password == null || password.length() < 8) {
            throw ApiException.invalidField(field, "Use at least 8 characters.");
        }
        if (password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw ApiException.invalidField(field, "That password is too long. Use at most 72 bytes.");
        }
        if (password.isBlank()) {
            throw ApiException.invalidField(field, "A password can't be only spaces.");
        }
    }
}
