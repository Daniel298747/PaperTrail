package com.papertrail;

import java.time.ZoneOffset;
import java.util.TimeZone;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class PaperTrailApplication {

    public static void main(String[] args) {
        // All persisted instants are UTC; calendar dates are resolved per account timezone.
        TimeZone.setDefault(TimeZone.getTimeZone(ZoneOffset.UTC));
        SpringApplication.run(PaperTrailApplication.class, args);
    }
}
