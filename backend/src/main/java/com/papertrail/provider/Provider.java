package com.papertrail.provider;

import java.util.UUID;

import com.papertrail.category.Category;
import com.papertrail.common.AuditedEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "providers")
public class Provider extends AuditedEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(nullable = false, length = 120)
    private String name;

    /** Pre-selected category when this provider is chosen on a new bill. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "default_category_id")
    private Category defaultCategory;

    protected Provider() {
    }

    public Provider(UUID userId, String name, Category defaultCategory) {
        this.userId = userId;
        this.name = name;
        this.defaultCategory = defaultCategory;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public Category getDefaultCategory() {
        return defaultCategory;
    }

    public void setDefaultCategory(Category defaultCategory) {
        this.defaultCategory = defaultCategory;
    }
}
