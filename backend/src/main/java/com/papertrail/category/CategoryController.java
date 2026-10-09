package com.papertrail.category;

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

import com.papertrail.category.dto.CategoryDtos.CategoryRequest;
import com.papertrail.category.dto.CategoryDtos.CategoryResponse;
import com.papertrail.security.AuthUser;
import com.papertrail.security.CurrentUser;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/categories")
public class CategoryController {

    private final CategoryService categories;

    public CategoryController(CategoryService categories) {
        this.categories = categories;
    }

    @GetMapping
    public List<CategoryResponse> list(@CurrentUser AuthUser user) {
        return categories.list(user.id());
    }

    @PostMapping
    public ResponseEntity<CategoryResponse> create(@CurrentUser AuthUser user,
            @Valid @RequestBody CategoryRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(categories.create(user.id(), request));
    }

    @PutMapping("/{id}")
    public CategoryResponse rename(@CurrentUser AuthUser user, @PathVariable UUID id,
            @Valid @RequestBody CategoryRequest request) {
        return categories.rename(user.id(), id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@CurrentUser AuthUser user, @PathVariable UUID id,
            @RequestParam(required = false) UUID reassignTo) {
        categories.delete(user.id(), id, reassignTo);
        return ResponseEntity.noContent().build();
    }
}
