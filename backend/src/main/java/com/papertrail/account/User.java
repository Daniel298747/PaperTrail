package com.papertrail.account;

import java.time.ZoneId;
import java.util.UUID;

import com.papertrail.common.AuditedEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** An account. In this version each account is exactly one household. */
@Entity
@Table(name = "users")
public class User extends AuditedEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 254)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 100)
    private String passwordHash;

    @Column(name = "display_name", nullable = false, length = 80)
    private String displayName;

    /** ISO 4217 code. One currency per account; totals never mix currencies. */
    @Column(nullable = false, length = 3)
    private String currency;

    /** IANA zone id, e.g. Europe/Dublin. Decides what "today" means for this household. */
    @Column(nullable = false, length = 64)
    private String timezone;

    @Column(name = "default_reminder_lead_days", nullable = false)
    private int defaultReminderLeadDays;

    protected User() {
    }

    public User(String email, String passwordHash, String displayName, String currency, String timezone) {
        this.email = email;
        this.passwordHash = passwordHash;
        this.displayName = displayName;
        this.currency = currency;
        this.timezone = timezone;
        this.defaultReminderLeadDays = 3;
    }

    public ZoneId zoneId() {
        return ZoneId.of(timezone);
    }

    public UUID getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public String getCurrency() {
        return currency;
    }

    public void setCurrency(String currency) {
        this.currency = currency;
    }

    public String getTimezone() {
        return timezone;
    }

    public void setTimezone(String timezone) {
        this.timezone = timezone;
    }

    public int getDefaultReminderLeadDays() {
        return defaultReminderLeadDays;
    }

    public void setDefaultReminderLeadDays(int defaultReminderLeadDays) {
        this.defaultReminderLeadDays = defaultReminderLeadDays;
    }
}
