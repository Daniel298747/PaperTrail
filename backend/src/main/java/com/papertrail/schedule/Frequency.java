package com.papertrail.schedule;

public enum Frequency {
    MONTHLY(1), QUARTERLY(3), ANNUAL(12);

    private final int months;

    Frequency(int months) {
        this.months = months;
    }

    public int months() {
        return months;
    }
}
