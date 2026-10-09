package com.papertrail.common;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class UsageCounts {

    private UsageCounts() {
    }

    /** Turns [id, count] rows from a grouped JPQL query into a lookup map. */
    public static Map<UUID, Long> toMap(List<Object[]> rows) {
        Map<UUID, Long> counts = new HashMap<>();
        for (Object[] row : rows) {
            counts.put((UUID) row[0], ((Number) row[1]).longValue());
        }
        return counts;
    }
}
