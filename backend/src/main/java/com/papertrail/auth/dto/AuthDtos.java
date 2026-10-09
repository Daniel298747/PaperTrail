package com.papertrail.auth.dto;

import java.time.Instant;

import com.papertrail.account.dto.AccountResponse;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class AuthDtos {

    private AuthDtos() {
    }

    public record RegisterRequest(
            @NotBlank(message = "Enter your email address.")
            @Email(message = "Enter a valid email address.")
            @Size(max = 254, message = "Email is too long.")
            String email,
            @NotBlank(message = "Choose a password.")
            @Size(min = 8, max = 72, message = "Use between 8 and 72 characters.")
            String password,
            @NotBlank(message = "Enter a household or display name.")
            @Size(max = 80, message = "Use at most 80 characters.")
            String displayName,
            @Size(max = 64)
            String timezone,
            @Size(max = 3)
            String currency) {
    }

    public record LoginRequest(
            @NotBlank(message = "Enter your email address.") String email,
            @NotBlank(message = "Enter your password.") String password) {
    }

    public record AuthResponse(String accessToken, String tokenType, Instant expiresAt, AccountResponse account) {
    }

    public record CsrfResponse(String headerName, String token) {
    }
}
