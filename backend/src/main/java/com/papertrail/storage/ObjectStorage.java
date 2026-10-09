package com.papertrail.storage;

import java.net.URI;
import java.time.Duration;

import org.slf4j.LoggerFactory;

/** Private object storage for statements. Objects are only ever reached through short-lived signed URLs. */
public interface ObjectStorage {

    void put(String key, byte[] content, String contentType);

    void delete(String key);

    /** A time-limited GET URL; {@code contentDisposition} decides between inline preview and download. */
    URI presignGet(String key, Duration ttl, String contentType, String contentDisposition);

    default void deleteQuietly(String key) {
        try {
            delete(key);
        } catch (RuntimeException e) {
            LoggerFactory.getLogger(ObjectStorage.class).warn("Could not delete stored object {}: {}", key,
                    e.getMessage());
        }
    }
}
