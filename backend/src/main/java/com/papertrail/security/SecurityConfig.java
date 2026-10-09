package com.papertrail.security;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.DelegatingPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import com.papertrail.config.AppProperties;

/**
 * Authentication model:
 * <ul>
 * <li>API calls carry a short-lived access JWT in the Authorization header (held in browser memory).
 * Header-borne credentials are not sent automatically by browsers, so those calls are not CSRF-prone.</li>
 * <li>The refresh token lives in an HttpOnly cookie scoped to /api/auth. Only the POST endpoints under
 * /api/auth act on cookies, so CSRF protection (double-submit token from GET /api/auth/csrf) is enforced
 * exactly there.</li>
 * </ul>
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    public static final String CSRF_COOKIE = "XSRF-TOKEN";
    public static final String CSRF_HEADER = "X-XSRF-TOKEN";

    @Bean
    public SecurityFilterChain apiSecurity(HttpSecurity http, JwtDecoder jwtDecoder, ProblemResponses problems,
            CorsConfigurationSource corsConfigurationSource, AppProperties properties) throws Exception {
        CookieCsrfTokenRepository csrfTokens = new CookieCsrfTokenRepository();
        csrfTokens.setCookieName(CSRF_COOKIE);
        csrfTokens.setHeaderName(CSRF_HEADER);
        csrfTokens.setCookiePath("/");
        csrfTokens.setCookieCustomizer(cookie -> cookie
                .sameSite(properties.refresh().cookieSameSite())
                .secure(properties.refresh().cookieSecure()));

        http
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
                .csrf(csrf -> csrf
                        .csrfTokenRepository(csrfTokens)
                        .requireCsrfProtectionMatcher(PathPatternRequestMatcher.pathPattern(HttpMethod.POST, "/api/auth/**")))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .requestCache(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.GET, "/api/auth/csrf").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/login", "/api/auth/refresh",
                                "/api/auth/logout").permitAll()
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                        .requestMatchers("/error").permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(resourceServer -> resourceServer
                        .bearerTokenResolver(bearerTokenResolver())
                        .jwt(jwt -> jwt.decoder(jwtDecoder))
                        .authenticationEntryPoint(problems)
                        .accessDeniedHandler(problems))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(problems)
                        .accessDeniedHandler(problems))
                .headers(headers -> headers
                        .contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'none'; frame-ancestors 'none'"))
                        .referrerPolicy(referrer -> referrer.policy(
                                org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER)));
        return http.build();
    }

    /** Auth endpoints ignore Authorization headers so an expired access token can never block a refresh. */
    private static BearerTokenResolver bearerTokenResolver() {
        DefaultBearerTokenResolver delegate = new DefaultBearerTokenResolver();
        return request -> request.getRequestURI().startsWith("/api/auth/") ? null : delegate.resolve(request);
    }

    @Bean
    public PasswordEncoder passwordEncoder(AppProperties properties) {
        int strength = properties.passwordHashing().bcryptStrength();
        return new DelegatingPasswordEncoder("bcrypt", Map.of("bcrypt", new BCryptPasswordEncoder(strength)));
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource(AppProperties properties) {
        List<String> origins = properties.cors().allowedOrigins() == null ? List.of()
                : properties.cors().allowedOrigins().stream().map(String::trim).filter(o -> !o.isEmpty()).toList();
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(origins);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept", CSRF_HEADER));
        config.setAllowCredentials(true);
        config.setMaxAge(Duration.ofHours(1));
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }
}
