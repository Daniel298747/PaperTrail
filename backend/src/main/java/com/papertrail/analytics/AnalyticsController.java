package com.papertrail.analytics;

import java.time.YearMonth;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.papertrail.analytics.dto.AnalyticsDtos.CategoryBreakdownResponse;
import com.papertrail.analytics.dto.AnalyticsDtos.MonthlyResponse;
import com.papertrail.analytics.dto.AnalyticsDtos.ProviderTrendResponse;
import com.papertrail.analytics.dto.AnalyticsDtos.SummaryResponse;
import com.papertrail.security.AuthUser;
import com.papertrail.security.CurrentUser;

/** Month parameters use the YYYY-MM format; the range is inclusive of both months. */
@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {

    private final AnalyticsService analytics;

    public AnalyticsController(AnalyticsService analytics) {
        this.analytics = analytics;
    }

    @GetMapping("/summary")
    public SummaryResponse summary(@CurrentUser AuthUser user,
            @RequestParam(required = false) YearMonth from,
            @RequestParam(required = false) YearMonth to,
            @RequestParam(required = false) UUID providerId) {
        return analytics.summary(user.id(), from, to, providerId);
    }

    @GetMapping("/monthly")
    public MonthlyResponse monthly(@CurrentUser AuthUser user,
            @RequestParam(required = false) YearMonth from,
            @RequestParam(required = false) YearMonth to,
            @RequestParam(required = false) UUID providerId) {
        return analytics.monthly(user.id(), from, to, providerId);
    }

    @GetMapping("/categories")
    public CategoryBreakdownResponse categories(@CurrentUser AuthUser user,
            @RequestParam(required = false) YearMonth from,
            @RequestParam(required = false) YearMonth to,
            @RequestParam(required = false) UUID providerId) {
        return analytics.categories(user.id(), from, to, providerId);
    }

    @GetMapping("/providers")
    public ProviderTrendResponse providers(@CurrentUser AuthUser user,
            @RequestParam(required = false) YearMonth from,
            @RequestParam(required = false) YearMonth to,
            @RequestParam(required = false) UUID providerId) {
        return analytics.providerTrends(user.id(), from, to, providerId);
    }
}
