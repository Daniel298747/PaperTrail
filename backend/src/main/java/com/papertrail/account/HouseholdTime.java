package com.papertrail.account;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import org.springframework.stereotype.Component;

/** Resolves calendar dates in the household's own timezone. All "today" logic goes through here. */
@Component
public class HouseholdTime {

    private final Clock clock;

    public HouseholdTime(Clock clock) {
        this.clock = clock;
    }

    public LocalDate today(User user) {
        return LocalDate.now(clock.withZone(user.zoneId()));
    }

    public static LocalDate today(Instant now, ZoneId zone) {
        return LocalDate.ofInstant(now, zone);
    }

    public Instant now() {
        return clock.instant();
    }
}
