package com.papertrail.common;

import java.util.UUID;

/** A lightweight reference to a related record (provider, category, schedule). */
public record NamedRef(UUID id, String name) {
}
