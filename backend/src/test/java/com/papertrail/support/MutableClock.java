package com.papertrail.support;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

/** System time by default; tests can pin or advance it. Zone views share the same instant source. */
public class MutableClock extends Clock {

    private volatile Instant fixed;

    public void set(Instant instant) {
        this.fixed = instant;
    }

    public void advance(Duration duration) {
        this.fixed = instant().plus(duration);
    }

    public void reset() {
        this.fixed = null;
    }

    @Override
    public Instant instant() {
        Instant current = fixed;
        return current != null ? current : Instant.now();
    }

    @Override
    public ZoneId getZone() {
        return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
        MutableClock source = this;
        return new Clock() {
            @Override
            public ZoneId getZone() {
                return zone;
            }

            @Override
            public Clock withZone(ZoneId other) {
                return source.withZone(other);
            }

            @Override
            public Instant instant() {
                return source.instant();
            }
        };
    }
}
