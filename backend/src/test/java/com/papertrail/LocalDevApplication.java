package com.papertrail;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;

/**
 * Runs the API against an embedded PostgreSQL 17 server, so the backend works without Docker or a local
 * PostgreSQL install:
 *
 * <pre>./mvnw spring-boot:test-run</pre>
 *
 * Data persists in {@code backend/.local/pgdata} (override with LOCAL_PG_DATA); the server listens on port
 * 5433 (LOCAL_PG_PORT). Storage and auth settings come from the repository's .env file as usual.
 */
public final class LocalDevApplication {

    private LocalDevApplication() {
    }

    public static void main(String[] args) throws Exception {
        int port = Integer.parseInt(env("LOCAL_PG_PORT", "5433"));
        Path dataDirectory = Path.of(env("LOCAL_PG_DATA", ".local/pgdata")).toAbsolutePath();
        Files.createDirectories(dataDirectory.getParent());

        EmbeddedPostgres postgres = EmbeddedPostgres.builder()
                .setPort(port)
                .setDataDirectory(dataDirectory)
                .setCleanDataDirectory(false)
                .start();
        try (Connection connection = postgres.getPostgresDatabase().getConnection();
                Statement statement = connection.createStatement();
                ResultSet existing = statement.executeQuery(
                        "select 1 from pg_database where datname = 'papertrail'")) {
            if (!existing.next()) {
                statement.execute("create database papertrail");
            }
        }

        System.setProperty("spring.datasource.url", postgres.getJdbcUrl("postgres", "papertrail"));
        System.setProperty("spring.datasource.username", "postgres");
        System.setProperty("spring.datasource.password", "");
        PaperTrailApplication.main(args);
    }

    private static String env(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }
}
