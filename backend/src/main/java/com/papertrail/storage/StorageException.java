package com.papertrail.storage;

/** The object store could not complete an operation. Mapped to 502 by the API error handler. */
public class StorageException extends RuntimeException {

    public StorageException(String message, Throwable cause) {
        super(message, cause);
    }
}
