package com.papertrail.config;

import java.time.Clock;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ClockConfig {

    /** Injected everywhere "now" matters so scheduling and status logic stay testable. */
    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
