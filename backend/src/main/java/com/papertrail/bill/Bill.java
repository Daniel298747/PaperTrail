package com.papertrail.bill;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import com.papertrail.category.Category;
import com.papertrail.common.AuditedEntity;
import com.papertrail.provider.Provider;
import com.papertrail.schedule.RecurringBillSchedule;

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

@Entity
@Table(name = "bills")
public class Bill extends AuditedEntity {

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

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    @Column(nullable = false, length = 3, updatable = false)
    private String currency;

    @Column(name = "due_date", nullable = false)
    private LocalDate dueDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private PaymentStatus status;

    @Column(name = "paid_date")
    private LocalDate paidDate;

    @Column(name = "reminder_lead_days", nullable = false)
    private int reminderLeadDays;

    @Column(length = 2000)
    private String notes;

    /** Set when the bill was generated from a recurring schedule; null for one-off bills. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "schedule_id")
    private RecurringBillSchedule schedule;

    @Version
    private long version;

    protected Bill() {
    }

    public Bill(UUID userId, String currency) {
        this.userId = userId;
        this.currency = currency;
        this.status = PaymentStatus.UNPAID;
    }

    public static Bill fromSchedule(RecurringBillSchedule schedule, LocalDate dueDate) {
        Bill bill = new Bill(schedule.getUserId(), schedule.getCurrency());
        bill.title = schedule.getTitle();
        bill.provider = schedule.getProvider();
        bill.category = schedule.getCategory();
        bill.amount = schedule.getAmount();
        bill.dueDate = dueDate;
        bill.reminderLeadDays = schedule.getReminderLeadDays();
        bill.schedule = schedule;
        return bill;
    }

    public void markPaid(LocalDate paidOn) {
        this.status = PaymentStatus.PAID;
        this.paidDate = paidOn;
    }

    public void markUnpaid() {
        this.status = PaymentStatus.UNPAID;
        this.paidDate = null;
    }

    public BillStatus effectiveStatus(LocalDate today) {
        return BillStatus.derive(status, dueDate, today);
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

    public LocalDate getDueDate() {
        return dueDate;
    }

    public void setDueDate(LocalDate dueDate) {
        this.dueDate = dueDate;
    }

    public PaymentStatus getStatus() {
        return status;
    }

    public LocalDate getPaidDate() {
        return paidDate;
    }

    public int getReminderLeadDays() {
        return reminderLeadDays;
    }

    public void setReminderLeadDays(int reminderLeadDays) {
        this.reminderLeadDays = reminderLeadDays;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public RecurringBillSchedule getSchedule() {
        return schedule;
    }

    public long getVersion() {
        return version;
    }
}
