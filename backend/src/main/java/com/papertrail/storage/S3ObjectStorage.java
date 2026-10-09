package com.papertrail.storage;

import java.net.URI;
import java.net.URISyntaxException;
import java.time.Duration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadBucketRequest;
import software.amazon.awssdk.services.s3.model.NoSuchBucketException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

/** AWS S3 (or any S3-compatible store such as MinIO) behind {@link ObjectStorage}. */
public class S3ObjectStorage implements ObjectStorage {

    private static final Logger log = LoggerFactory.getLogger(S3ObjectStorage.class);

    private final S3Client client;
    private final S3Presigner presigner;
    private final String bucket;

    public S3ObjectStorage(S3Client client, S3Presigner presigner, String bucket) {
        this.client = client;
        this.presigner = presigner;
        this.bucket = bucket;
    }

    @Override
    public void put(String key, byte[] content, String contentType) {
        try {
            client.putObject(PutObjectRequest.builder()
                    .bucket(bucket)
                    .key(key)
                    .contentType(contentType)
                    .contentLength((long) content.length)
                    .build(), RequestBody.fromBytes(content));
        } catch (SdkException e) {
            throw new StorageException("Upload to bucket " + bucket + " failed", e);
        }
    }

    @Override
    public void delete(String key) {
        try {
            client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
        } catch (SdkException e) {
            throw new StorageException("Delete from bucket " + bucket + " failed", e);
        }
    }

    @Override
    public URI presignGet(String key, Duration ttl, String contentType, String contentDisposition) {
        GetObjectRequest getRequest = GetObjectRequest.builder()
                .bucket(bucket)
                .key(key)
                .responseContentType(contentType)
                .responseContentDisposition(contentDisposition)
                .responseCacheControl("private, no-store")
                .build();
        try {
            return presigner.presignGetObject(GetObjectPresignRequest.builder()
                    .signatureDuration(ttl)
                    .getObjectRequest(getRequest)
                    .build()).url().toURI();
        } catch (URISyntaxException | SdkException e) {
            throw new StorageException("Could not sign a download URL", e);
        }
    }

    /** Creates the bucket if it doesn't exist (intended for local MinIO; provision AWS buckets explicitly). */
    public void ensureBucketExists() {
        try {
            client.headBucket(HeadBucketRequest.builder().bucket(bucket).build());
        } catch (NoSuchBucketException e) {
            create();
        } catch (S3Exception e) {
            if (e.statusCode() == 404) {
                create();
            } else {
                throw e;
            }
        }
    }

    private void create() {
        client.createBucket(CreateBucketRequest.builder().bucket(bucket).build());
        log.info("Created storage bucket {}", bucket);
    }
}
