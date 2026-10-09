package com.papertrail.category.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class CategoryDtos {

    private CategoryDtos() {
    }

    public record CategoryRequest(
            @NotBlank(message = "Enter a category name.")
            @Size(max = 60, message = "Use at most 60 characters.")
            String name) {
    }

    public record CategoryResponse(UUID id, String name, long billCount, long scheduleCount) {
    }
}
