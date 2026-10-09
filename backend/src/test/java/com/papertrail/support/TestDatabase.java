package com.papertrail.support;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;

/**
 * One real PostgreSQL server per test JVM (zonky embedded binaries: no Docker required). Flyway migrates it
 * when the Spring context starts, so tests exercise the actual schema, constraints and SQL.
 */
public final class TestDatabase {

    private static EmbeddedPostgres postgres;

    private TestDatabase() {
    }

    public static synchronized String jdbcUrl() {
        if (postgres == null) {
            try {
                postgres = EmbeddedPostgres.builder().start();
                try (Connection connection = postgres.getPostgresDatabase().getConnection();
                        Statement statement = connection.createStatement()) {
                    statement.execute("create database papertrail_test");
                }
            } catch (IOException e) {
                throw new UncheckedIOException("Could not start embedded PostgreSQL", e);
            } catch (SQLException e) {
                throw new IllegalStateException("Could not create test database", e);
            }
        }
        return postgres.getJdbcUrl("postgres", "papertrail_test");
    }
}
