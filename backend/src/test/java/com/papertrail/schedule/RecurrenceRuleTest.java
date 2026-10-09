package com.papertrail.schedule;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

import org.junit.jupiter.api.Test;

class RecurrenceRuleTest {

    private static LocalDate d(String iso) {
        return LocalDate.parse(iso);
    }

    @Test
    void monthlyAnchorOn31stClampsToShortMonthsAndReturnsToThe31st() {
        RecurrenceRule rule = new RecurrenceRule(d("2026-01-01"), 31, Frequency.MONTHLY);

        assertThat(rule.nextOccurrences(d("2026-01-01"), 6)).containsExactly(
                d("2026-01-31"), d("2026-02-28"), d("2026-03-31"), d("2026-04-30"), d("2026-05-31"), d("2026-06-30"));
    }

    @Test
    void monthlyAnchorOn31stUsesLeapDayInLeapYears() {
        RecurrenceRule rule = new RecurrenceRule(d("2027-12-15"), 31, Frequency.MONTHLY);

        assertThat(rule.nextOccurrences(d("2027-12-15"), 4))
                .containsExactly(d("2027-12-31"), d("2028-01-31"), d("2028-02-29"), d("2028-03-31"));
    }

    @Test
    void anchorOn30thAnd29thSurviveFebruary() {
        assertThat(new RecurrenceRule(d("2026-01-30"), 30, Frequency.MONTHLY).nextOccurrences(d("2026-01-01"), 3))
                .containsExactly(d("2026-01-30"), d("2026-02-28"), d("2026-03-30"));
        assertThat(new RecurrenceRule(d("2026-01-29"), 29, Frequency.MONTHLY).nextOccurrences(d("2026-01-01"), 3))
                .containsExactly(d("2026-01-29"), d("2026-02-28"), d("2026-03-29"));
    }

    @Test
    void annualScheduleOnLeapDayFallsBackTo28thAndReturnsInTheNextLeapYear() {
        RecurrenceRule rule = new RecurrenceRule(d("2024-02-29"), 29, Frequency.ANNUAL);

        assertThat(rule.nextOccurrences(d("2024-01-01"), 5)).containsExactly(
                d("2024-02-29"), d("2025-02-28"), d("2026-02-28"), d("2027-02-28"), d("2028-02-29"));
    }

    @Test
    void quarterlyAnchorOn31stKeepsTheAnchorAcrossQuarters() {
        RecurrenceRule rule = new RecurrenceRule(d("2025-11-15"), 31, Frequency.QUARTERLY);

        assertThat(rule.nextOccurrences(d("2025-11-15"), 5)).containsExactly(
                d("2025-11-30"), d("2026-02-28"), d("2026-05-31"), d("2026-08-31"), d("2026-11-30"));
    }

    @Test
    void firstOccurrenceIsTheFirstBillingDayOnOrAfterTheStartDate() {
        assertThat(new RecurrenceRule(d("2026-03-20"), 15, Frequency.MONTHLY).firstOccurrence())
                .isEqualTo(d("2026-04-15"));
        assertThat(new RecurrenceRule(d("2026-03-15"), 15, Frequency.MONTHLY).firstOccurrence())
                .isEqualTo(d("2026-03-15"));
        assertThat(new RecurrenceRule(d("2026-03-20"), 15, Frequency.QUARTERLY).nextOccurrences(d("2026-01-01"), 2))
                .containsExactly(d("2026-04-15"), d("2026-07-15"));
    }

    @Test
    void occurrencesBetweenIsInclusiveAndEmptyForInvertedWindows() {
        RecurrenceRule rule = new RecurrenceRule(d("2026-01-10"), 10, Frequency.MONTHLY);

        assertThat(rule.occurrencesBetween(d("2026-02-10"), d("2026-04-10")))
                .containsExactly(d("2026-02-10"), d("2026-03-10"), d("2026-04-10"));
        assertThat(rule.occurrencesBetween(d("2026-04-11"), d("2026-04-01"))).isEmpty();
        assertThat(rule.occurrencesBetween(d("2025-01-01"), d("2026-01-09"))).isEmpty();
    }

    @Test
    void windowShortcutMatchesBruteForceIteration() {
        Random random = new Random(42);
        for (int i = 0; i < 2000; i++) {
            LocalDate start = d("2020-01-01").plusDays(random.nextInt(3000));
            int billingDay = 1 + random.nextInt(31);
            Frequency frequency = Frequency.values()[random.nextInt(3)];
            RecurrenceRule rule = new RecurrenceRule(start, billingDay, frequency);
            LocalDate from = start.plusDays(random.nextInt(2000) - 200);
            LocalDate to = from.plusDays(random.nextInt(400));

            List<LocalDate> expected = new ArrayList<>();
            for (long k = 0;; k++) {
                LocalDate date = rule.occurrence(k);
                if (date.isAfter(to)) {
                    break;
                }
                if (!date.isBefore(from)) {
                    expected.add(date);
                }
            }
            assertThat(rule.occurrencesBetween(from, to)).as("case %d: %s", i, rule).isEqualTo(expected);
        }
    }

    @Test
    void rejectsInvalidBillingDays() {
        assertThatThrownBy(() -> new RecurrenceRule(d("2026-01-01"), 0, Frequency.MONTHLY))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new RecurrenceRule(d("2026-01-01"), 32, Frequency.MONTHLY))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
