package com.papertrail.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

@TestConfiguration(proxyBeanMethods = false)
public class TestBeans {

    @Bean
    public InMemoryObjectStorage objectStorage() {
        return new InMemoryObjectStorage();
    }

    @Bean
    @Primary
    public MutableClock mutableClock() {
        return new MutableClock();
    }
}
