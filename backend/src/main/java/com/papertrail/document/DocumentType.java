package com.papertrail.document;

import java.nio.charset.StandardCharsets;
import java.util.Optional;

/**
 * Accepted statement formats, identified by their leading bytes. The client's declared content type and
 * file extension are ignored: a renamed text file is rejected, and the stored type always matches the bytes.
 */
public enum DocumentType {
    PDF("application/pdf", "pdf"),
    JPEG("image/jpeg", "jpg"),
    PNG("image/png", "png");

    private static final byte[] PDF_MAGIC = "%PDF-".getBytes(StandardCharsets.US_ASCII);
    private static final byte[] PNG_MAGIC = { (byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n' };
    /** The PDF spec tolerates a little junk before the header; readers look within the first 1 KB. */
    private static final int PDF_HEADER_SEARCH_WINDOW = 1024;

    private final String mimeType;
    private final String extension;

    DocumentType(String mimeType, String extension) {
        this.mimeType = mimeType;
        this.extension = extension;
    }

    public String mimeType() {
        return mimeType;
    }

    public String extension() {
        return extension;
    }

    public static Optional<DocumentType> detect(byte[] bytes) {
        if (bytes == null || bytes.length < 4) {
            return Optional.empty();
        }
        if (startsWith(bytes, PNG_MAGIC, 0)) {
            return Optional.of(PNG);
        }
        if ((bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xD8 && (bytes[2] & 0xFF) == 0xFF) {
            return Optional.of(JPEG);
        }
        int window = Math.min(bytes.length - PDF_MAGIC.length, PDF_HEADER_SEARCH_WINDOW);
        for (int offset = 0; offset <= window; offset++) {
            if (startsWith(bytes, PDF_MAGIC, offset)) {
                return Optional.of(PDF);
            }
        }
        return Optional.empty();
    }

    private static boolean startsWith(byte[] bytes, byte[] prefix, int offset) {
        if (bytes.length - offset < prefix.length) {
            return false;
        }
        for (int i = 0; i < prefix.length; i++) {
            if (bytes[offset + i] != prefix[i]) {
                return false;
            }
        }
        return true;
    }
}
