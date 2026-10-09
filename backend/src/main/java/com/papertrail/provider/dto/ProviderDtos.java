package com.papertrail.provider.dto;

import java.util.UUID;

import com.papertrail.common.NamedRef;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class ProviderDtos {

    private ProviderDtos() {
    }

    public record ProviderRequest(
            @NotBlank(message = "Enter a provider name.")
            @Size(max = 120, message = "Use at most 120 characters.")
            String name,
            UUID defaultCategoryId) {
    }

    public record ProviderResponse(UUID id, String name, NamedRef defaultCategory, long billCount,
            long scheduleCount) {
    }
}
