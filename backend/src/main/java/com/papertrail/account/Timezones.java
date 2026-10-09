package com.papertrail.account;

import java.time.ZoneId;

import com.papertrail.common.ApiException;

public final class Timezones {

    private Timezones() {
    }

    /** Accepts IANA region ids only (e.g. Europe/Dublin), never raw offsets, so DST is handled. */
    public static String require(String zone, String field) {
        String candidate = zone == null ? "" : zone.trim();
        if (!ZoneId.getAvailableZoneIds().contains(candidate)) {
            throw ApiException.invalidField(field, "Choose a timezone from the list, for example Europe/Dublin.");
        }
        return candidate;
    }

    public static String orDefault(String zone, String field) {
        return zone == null || zone.isBlank() ? "UTC" : require(zone, field);
    }
}
