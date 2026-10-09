package com.papertrail.common;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

/**
 * Domain error translated into an RFC 9457 problem response by {@link ApiExceptionHandler}.
 * {@code code} is a stable machine-readable identifier the frontend can branch on.
 */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private final Map<String, Object> details;
    private final List<FieldViolation> fieldErrors;
    private final HttpHeaders headers = new HttpHeaders();

    public ApiException(HttpStatus status, String code, String message) {
        this(status, code, message, Map.of(), List.of());
    }

    public ApiException(HttpStatus status, String code, String message, Map<String, Object> details,
            List<FieldViolation> fieldErrors) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
        this.fieldErrors = fieldErrors;
    }

    public static ApiException notFound(String resource) {
        return new ApiException(HttpStatus.NOT_FOUND, "not_found", resource + " not found.");
    }

    public static ApiException conflict(String code, String message) {
        return new ApiException(HttpStatus.CONFLICT, code, message);
    }

    public static ApiException conflict(String code, String message, Map<String, Object> details) {
        return new ApiException(HttpStatus.CONFLICT, code, message, details, List.of());
    }

    public static ApiException badRequest(String code, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, code, message);
    }

    public static ApiException invalidField(String field, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "validation_failed", "Some fields need attention.",
                Map.of(), List.of(new FieldViolation(field, message)));
    }

    public static ApiException unauthorized(String code, String message) {
        return new ApiException(HttpStatus.UNAUTHORIZED, code, message);
    }

    /** Adds a header to the error response (e.g. Set-Cookie to clear a stale session cookie). */
    public ApiException withHeader(String name, String value) {
        headers.add(name, value);
        return this;
    }

    public HttpHeaders getHeaders() {
        return headers;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }

    public Map<String, Object> getDetails() {
        return details;
    }

    public List<FieldViolation> getFieldErrors() {
        return fieldErrors;
    }

    public record FieldViolation(String field, String message) {
    }
}
