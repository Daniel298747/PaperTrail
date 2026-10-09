package com.papertrail.common;

import java.util.Locale;
import java.util.Map;

import org.springframework.data.domain.Sort;

/** Parses "field,direction" against a whitelist so clients can't sort by arbitrary entity paths. */
public final class SortParser {

    private SortParser() {
    }

    public static Sort parse(String value, Map<String, String> allowed, Sort fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        String[] parts = value.split(",", 2);
        String property = allowed.get(parts[0].trim());
        if (property == null) {
            throw ApiException.badRequest("invalid_sort", "Sorting by '" + parts[0].trim() + "' isn't supported.");
        }
        Sort.Direction direction = parts.length > 1 && parts[1].trim().toLowerCase(Locale.ROOT).equals("desc")
                ? Sort.Direction.DESC
                : Sort.Direction.ASC;
        return Sort.by(direction, property);
    }
}
