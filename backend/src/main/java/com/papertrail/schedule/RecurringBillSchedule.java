package com.papertrail.schedule;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import com.papertrail.category.Category;
import com.papertrail.common.AuditedEntity;
import com.papertrail.provider.Provider;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

/**
 * A recurring bill template. The scheduled job turns it into concrete {@code Bill} rows inside the
 * generation horizon. Editing a schedule only changes future generation; generated bills are separate
 * records and are never rewritten.
 */
@Entity
@Table(name = "recurring_bill_schedules")
public class RecurringBillSchedule extends AuditedEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(nullable = false, length = 160)
    private String title;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "provider_id", nullable = false)
    private Provider provider;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "category_id", nullable = false)
    private Category category;

    /** Default amount copied onto each generated bill. */
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    @Column(nullable = false, length = 3)
    private String currency;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Frequency frequency;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    /** Day-of-month anchor (1-31). Short months clamp to their last day without moving the anchor. */
    @Column(name = "billing_day", nullable = false)
    private int billingDay;

    @Column(name = "reminder_lead_days", nullable = false)
    private int reminderLeadDays;

    @Column(nullable = false)
    private boolean active;

    @Column(length = 2000)
    private String notes;

    @Version
    private long version;

    protected RecurringBillSchedule() {
    }

    public RecurringBillSchedule(UUID userId, String currency) {
        this.userId = userId;
        this.currency = currency;
        this.active = true;
    }

    public RecurrenceRule rule() {
        return new RecurrenceRule(startDate, billingDay, frequency);
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public Provider getProvider() {
        return provider;
    }

    public void setProvider(Provider provider) {
        this.provider = provider;
    }

    public Category getCategory() {
        return category;
    }

    public void setCategory(Category category) {
        this.category = category;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public String getCurrency() {
        return currency;
    }

    public Frequency getFrequency() {
        return frequency;
    }

    public void setFrequency(Frequency frequency) {
        this.frequency = frequency;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public void setStartDate(LocalDate startDate) {
        this.startDate = startDate;
    }

    public int getBillingDay() {
        return billingDay;
    }

    public void setBillingDay(int billingDay) {
        this.billingDay = billingDay;
    }

    public int getReminderLeadDays() {
        return reminderLeadDays;
    }

    public void setReminderLeadDays(int reminderLeadDays) {
        this.reminderLeadDays = reminderLeadDays;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public long getVersion() {
        return version;
    }
}
