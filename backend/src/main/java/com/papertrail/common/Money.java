package com.papertrail.common;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Currency;

/**
 * Money is carried as {@link BigDecimal} end to end and serialised as a plain decimal string
 * ("84.20") so no client ever sees a binary floating-point approximation.
 */
public final class Money {

    private Money() {
    }

    public static String format(BigDecimal amount) {
        return normalize(amount).toPlainString();
    }

    public static BigDecimal normalize(BigDecimal amount) {
        return (amount == null ? BigDecimal.ZERO : amount).setScale(2, RoundingMode.HALF_UP);
    }

    public static boolean isValidCurrency(String code) {
        if (code == null || !code.matches("[A-Z]{3}")) {
            return false;
        }
        try {
            Currency.getInstance(code);
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
