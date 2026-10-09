package com.papertrail.common;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.TypeMismatchException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import com.papertrail.common.ApiException.FieldViolation;
import com.papertrail.storage.StorageException;

/** Renders every API error as application/problem+json with a stable {@code code} property. */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Object> handleApiException(ApiException ex, WebRequest request) {
        ProblemDetail problem = problem(ex.getStatus(), ex.getCode(), ex.getMessage(), request);
        ex.getDetails().forEach(problem::setProperty);
        if (!ex.getFieldErrors().isEmpty()) {
            problem.setProperty("errors", ex.getFieldErrors());
        }
        return ResponseEntity.status(ex.getStatus()).headers(ex.getHeaders())
                .contentType(MediaType.APPLICATION_PROBLEM_JSON).body(problem);
    }

    @ExceptionHandler(StorageException.class)
    public ResponseEntity<Object> handleStorage(StorageException ex, WebRequest request) {
        log.error("Document storage failure: {}", ex.getMessage(), ex);
        return respond(HttpStatus.BAD_GATEWAY, problem(HttpStatus.BAD_GATEWAY, "storage_unavailable",
                "Document storage is unavailable right now. Nothing was saved; try again shortly.", request));
    }

    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    public ResponseEntity<Object> handleStaleUpdate(ObjectOptimisticLockingFailureException ex, WebRequest request) {
        return respond(HttpStatus.CONFLICT, problem(HttpStatus.CONFLICT, "stale_update",
                "This record was changed elsewhere. Reload it and try again.", request));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Object> handleIntegrity(DataIntegrityViolationException ex, WebRequest request) {
        log.warn("Constraint violation: {}", ex.getMostSpecificCause().getMessage());
        return respond(HttpStatus.CONFLICT, problem(HttpStatus.CONFLICT, "constraint_violation",
                "The change conflicts with existing data.", request));
    }

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<Object> handleAuthentication(AuthenticationException ex, WebRequest request) {
        return respond(HttpStatus.UNAUTHORIZED, problem(HttpStatus.UNAUTHORIZED, "unauthenticated",
                "Sign in to continue.", request));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Object> handleUnexpected(Exception ex, WebRequest request) {
        log.error("Unhandled error", ex);
        return respond(HttpStatus.INTERNAL_SERVER_ERROR, problem(HttpStatus.INTERNAL_SERVER_ERROR, "internal_error",
                "Something went wrong on our side.", request));
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        List<FieldViolation> errors = new ArrayList<>();
        for (FieldError fieldError : ex.getBindingResult().getFieldErrors()) {
            errors.add(new FieldViolation(fieldError.getField(), fieldError.getDefaultMessage()));
        }
        ex.getBindingResult().getGlobalErrors()
                .forEach(e -> errors.add(new FieldViolation(e.getObjectName(), e.getDefaultMessage())));
        ProblemDetail problem = problem(HttpStatus.BAD_REQUEST, "validation_failed", "Some fields need attention.",
                request);
        problem.setProperty("errors", errors);
        return respond(HttpStatus.BAD_REQUEST, problem);
    }

    @Override
    protected ResponseEntity<Object> handleHandlerMethodValidationException(HandlerMethodValidationException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        List<FieldViolation> errors = new ArrayList<>();
        ex.getParameterValidationResults().forEach(result -> result.getResolvableErrors().forEach(error -> errors.add(
                new FieldViolation(result.getMethodParameter().getParameterName(), error.getDefaultMessage()))));
        ProblemDetail problem = problem(HttpStatus.BAD_REQUEST, "validation_failed", "Some fields need attention.",
                request);
        problem.setProperty("errors", errors);
        return respond(HttpStatus.BAD_REQUEST, problem);
    }

    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(HttpMessageNotReadableException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        return respond(HttpStatus.BAD_REQUEST, problem(HttpStatus.BAD_REQUEST, "malformed_request",
                "The request body is missing or has a value in the wrong format.", request));
    }

    @Override
    protected ResponseEntity<Object> handleTypeMismatch(TypeMismatchException ex, HttpHeaders headers,
            HttpStatusCode status, WebRequest request) {
        String name = ex.getPropertyName() == null ? "parameter" : ex.getPropertyName();
        return respond(HttpStatus.BAD_REQUEST, problem(HttpStatus.BAD_REQUEST, "invalid_parameter",
                "'" + name + "' has an invalid value.", request));
    }

    @Override
    protected ResponseEntity<Object> handleMaxUploadSizeExceededException(MaxUploadSizeExceededException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        return respond(HttpStatus.CONTENT_TOO_LARGE, problem(HttpStatus.CONTENT_TOO_LARGE, "file_too_large",
                "That file is larger than the upload limit.", request));
    }

    @Override
    protected ResponseEntity<Object> handleMissingServletRequestPart(MissingServletRequestPartException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        return respond(HttpStatus.BAD_REQUEST, problem(HttpStatus.BAD_REQUEST, "file_missing",
                "Choose a statement file to upload.", request));
    }

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception ex, Object body, HttpHeaders headers,
            HttpStatusCode statusCode, WebRequest request) {
        if (body instanceof ProblemDetail problem && (problem.getProperties() == null
                || !problem.getProperties().containsKey("code"))) {
            HttpStatus status = HttpStatus.resolve(statusCode.value());
            problem.setProperty("code", status == null ? "error"
                    : status.name().toLowerCase(java.util.Locale.ROOT));
        }
        return super.handleExceptionInternal(ex, body, headers, statusCode, request);
    }

    private static ProblemDetail problem(HttpStatus status, String code, String detail, WebRequest request) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(status.getReasonPhrase());
        problem.setProperty("code", code);
        if (request instanceof ServletWebRequest servletRequest) {
            problem.setInstance(URI.create(servletRequest.getRequest().getRequestURI()));
        }
        return problem;
    }

    private static ResponseEntity<Object> respond(HttpStatus status, ProblemDetail problem) {
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(problem);
    }
}
