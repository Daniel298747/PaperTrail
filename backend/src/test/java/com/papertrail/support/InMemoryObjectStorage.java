package com.papertrail.support;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

import com.papertrail.storage.ObjectStorage;
import com.papertrail.storage.StorageException;

/** Test double for S3 with hooks to simulate outages and races. */
public class InMemoryObjectStorage implements ObjectStorage {

    public record StoredObject(byte[] content, String contentType) {
    }

    private final Map<String, StoredObject> objects = new ConcurrentHashMap<>();
    private volatile boolean failPuts;
    private volatile Consumer<String> afterPut = key -> {
    };

    @Override
    public void put(String key, byte[] content, String contentType) {
        if (failPuts) {
            throw new StorageException("Simulated storage outage", new RuntimeException("connection refused"));
        }
        objects.put(key, new StoredObject(content.clone(), contentType));
        afterPut.accept(key);
    }

    @Override
    public void delete(String key) {
        objects.remove(key);
    }

    @Override
    public URI presignGet(String key, Duration ttl, String contentType, String contentDisposition) {
        return URI.create("https://storage.test/papertrail/" + key + "?X-Amz-Expires=" + ttl.toSeconds()
                + "&response-content-disposition=" + URLEncoder.encode(contentDisposition, StandardCharsets.UTF_8)
                + "&response-content-type=" + URLEncoder.encode(contentType, StandardCharsets.UTF_8));
    }

    public StoredObject get(String key) {
        return objects.get(key);
    }

    public boolean contains(String key) {
        return objects.containsKey(key);
    }

    public int size() {
        return objects.size();
    }

    public void failPuts(boolean fail) {
        this.failPuts = fail;
    }

    public void afterPut(Consumer<String> hook) {
        this.afterPut = hook;
    }

    /** Clears failure hooks between tests; stored objects are kept (each test uses its own household). */
    public void resetBehaviour() {
        failPuts = false;
        afterPut = key -> {
        };
    }
}
