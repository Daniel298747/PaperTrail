package com.papertrail.schedule;

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
import org.springframework.web.bind.annotation.RestController;

import com.papertrail.schedule.dto.ScheduleDtos.PreviewRequest;
import com.papertrail.schedule.dto.ScheduleDtos.PreviewResponse;
import com.papertrail.schedule.dto.ScheduleDtos.ScheduleDetailResponse;
import com.papertrail.schedule.dto.ScheduleDtos.ScheduleRequest;
import com.papertrail.schedule.dto.ScheduleDtos.ScheduleResponse;
import com.papertrail.security.AuthUser;
import com.papertrail.security.CurrentUser;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/schedules")
public class ScheduleController {

    private final ScheduleService schedules;

    public ScheduleController(ScheduleService schedules) {
        this.schedules = schedules;
    }

    @GetMapping
    public List<ScheduleResponse> list(@CurrentUser AuthUser user) {
        return schedules.list(user.id());
    }

    @GetMapping("/{id}")
    public ScheduleDetailResponse get(@CurrentUser AuthUser user, @PathVariable UUID id) {
        return schedules.get(user.id(), id);
    }

    @PostMapping
    public ResponseEntity<ScheduleDetailResponse> create(@CurrentUser AuthUser user,
            @Valid @RequestBody ScheduleRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(schedules.create(user.id(), request));
    }

    @PutMapping("/{id}")
    public ScheduleDetailResponse update(@CurrentUser AuthUser user, @PathVariable UUID id,
            @Valid @RequestBody ScheduleRequest request) {
        return schedules.update(user.id(), id, request);
    }

    @PostMapping("/{id}/pause")
    public ScheduleDetailResponse pause(@CurrentUser AuthUser user, @PathVariable UUID id) {
        return schedules.setActive(user.id(), id, false);
    }

    @PostMapping("/{id}/resume")
    public ScheduleDetailResponse resume(@CurrentUser AuthUser user, @PathVariable UUID id) {
        return schedules.setActive(user.id(), id, true);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@CurrentUser AuthUser user, @PathVariable UUID id) {
        schedules.delete(user.id(), id);
        return ResponseEntity.noContent().build();
    }

    /** Due dates a schedule would produce; lets the form show month-end behaviour before saving. */
    @PostMapping("/preview")
    public PreviewResponse preview(@CurrentUser AuthUser user, @Valid @RequestBody PreviewRequest request) {
        return new PreviewResponse(schedules.preview(user.id(), request));
    }
}
