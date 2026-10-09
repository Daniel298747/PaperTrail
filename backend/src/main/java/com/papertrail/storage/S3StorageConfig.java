package com.papertrail.storage;

import java.net.URI;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;

import com.papertrail.config.AppProperties;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

/**
 * S3 wiring. With no endpoint configured this talks to AWS S3 using the default credential chain
 * (env vars, profile, instance/task role). For MinIO set S3_ENDPOINT, path-style access and static keys.
 */
@Configuration
@ConditionalOnProperty(name = "app.storage.provider", havingValue = "s3", matchIfMissing = true)
public class S3StorageConfig {

    private static final Logger log = LoggerFactory.getLogger(S3StorageConfig.class);

    @Bean(destroyMethod = "close")
    public S3Client s3Client(AppProperties properties) {
        AppProperties.Storage storage = properties.storage();
        var builder = S3Client.builder()
                .region(Region.of(storage.region()))
                .credentialsProvider(credentials(storage))
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(storage.pathStyleAccess()).build())
                // Only send/require checksums when the operation demands them: broadest S3-compatible support.
                .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
                .responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED);
        if (hasText(storage.endpoint())) {
            builder.endpointOverride(URI.create(storage.endpoint()));
        }
        return builder.build();
    }

    /** Signs against the public endpoint, because the signature covers the host the browser will use. */
    @Bean(destroyMethod = "close")
    public S3Presigner s3Presigner(AppProperties properties) {
        AppProperties.Storage storage = properties.storage();
        var builder = S3Presigner.builder()
                .region(Region.of(storage.region()))
                .credentialsProvider(credentials(storage))
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(storage.pathStyleAccess()).build());
        String endpoint = hasText(storage.publicEndpoint()) ? storage.publicEndpoint() : storage.endpoint();
        if (hasText(endpoint)) {
            builder.endpointOverride(URI.create(endpoint));
        }
        return builder.build();
    }

    @Bean
    public S3ObjectStorage objectStorage(S3Client s3Client, S3Presigner s3Presigner, AppProperties properties) {
        return new S3ObjectStorage(s3Client, s3Presigner, properties.storage().bucket());
    }

    /** Runs before the demo seeder and the startup job run (see their @Order values). */
    @EventListener(ApplicationReadyEvent.class)
    @Order(0)
    public void createBucketIfConfigured(ApplicationReadyEvent event) {
        AppProperties properties = event.getApplicationContext().getBean(AppProperties.class);
        if (!properties.storage().createBucket()) {
            return;
        }
        S3ObjectStorage storage = event.getApplicationContext().getBean(S3ObjectStorage.class);
        for (int attempt = 1; attempt <= 5; attempt++) {
            try {
                storage.ensureBucketExists();
                return;
            } catch (RuntimeException e) {
                log.warn("Storage not reachable yet (attempt {}/5): {}", attempt, e.getMessage());
                try {
                    Thread.sleep(2000L * attempt);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }
        log.error("Could not verify bucket {}; uploads will fail until storage is reachable.",
                properties.storage().bucket());
    }

    private static AwsCredentialsProvider credentials(AppProperties.Storage storage) {
        if (hasText(storage.accessKey()) && hasText(storage.secretKey())) {
            return StaticCredentialsProvider.create(AwsBasicCredentials.create(storage.accessKey(), storage.secretKey()));
        }
        return DefaultCredentialsProvider.builder().build();
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
