package com.papertrail.provider;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.papertrail.provider.dto.ProviderDtos.ProviderRequest;
import com.papertrail.provider.dto.ProviderDtos.ProviderResponse;
import com.papertrail.security.AuthUser;
import com.papertrail.security.CurrentUser;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/providers")
public class ProviderController {

    private final ProviderService providers;

    public ProviderController(ProviderService providers) {
        this.providers = providers;
    }

    @GetMapping
    public List<ProviderResponse> list(@CurrentUser AuthUser user) {
        return providers.list(user.id());
    }

    @PostMapping
    public ResponseEntity<ProviderResponse> create(@CurrentUser AuthUser user,
            @Valid @RequestBody ProviderRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(providers.create(user.id(), request));
    }

    @PutMapping("/{id}")
    public ProviderResponse update(@CurrentUser AuthUser user, @PathVariable UUID id,
            @Valid @RequestBody ProviderRequest request) {
        return providers.update(user.id(), id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@CurrentUser AuthUser user, @PathVariable UUID id,
            @RequestParam(required = false) UUID reassignTo) {
        providers.delete(user.id(), id, reassignTo);
        return ResponseEntity.noContent().build();
    }
}
