package com.papertrail.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.AbstractMockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.jayway.jsonpath.JsonPath;

import jakarta.servlet.http.Cookie;
import tools.jackson.databind.ObjectMapper;

/**
 * Full-stack integration tests: real Spring context, real security filter chain, real PostgreSQL schema.
 * Every test registers fresh households, so tests stay independent while sharing one database.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestBeans.class)
public abstract class IntegrationTest {

    protected static final String PASSWORD = "correct-horse-battery";
    protected static final byte[] PDF_BYTES = "%PDF-1.4\n% test statement\n1 0 obj\n<< >>\nendobj\n%%EOF\n"
            .getBytes(StandardCharsets.US_ASCII);
    protected static final byte[] PNG_BYTES = { (byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n', 0, 0, 0, 13,
            'I', 'H', 'D', 'R' };

    @Autowired
    protected MockMvc mvc;
    @Autowired
    protected InMemoryObjectStorage storage;
    @Autowired
    protected MutableClock clock;
    @Autowired
    protected JdbcClient jdbc;
    @Autowired
    protected ObjectMapper objectMapper;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", TestDatabase::jdbcUrl);
        registry.add("spring.datasource.username", () -> "postgres");
        registry.add("spring.datasource.password", () -> "");
    }

    @BeforeEach
    void resetTestDoubles() {
        clock.reset();
        storage.resetBehaviour();
    }

    // ---------------------------------------------------------------- auth

    protected record Csrf(String headerName, String token, Cookie cookie) {
    }

    protected record Session(String userId, String email, String accessToken, Cookie refreshCookie) {
    }

    protected Csrf csrf() throws Exception {
        MvcResult result = mvc.perform(get("/api/auth/csrf")).andExpect(status().isOk()).andReturn();
        String body = result.getResponse().getContentAsString();
        return new Csrf(JsonPath.read(body, "$.headerName"), JsonPath.read(body, "$.token"),
                result.getResponse().getCookie("XSRF-TOKEN"));
    }

    protected Session register() throws Exception {
        return register("Europe/Dublin");
    }

    protected Session register(String timezone) throws Exception {
        String email = "household-" + UUID.randomUUID() + "@example.test";
        Csrf csrf = csrf();
        MvcResult result = mvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .header(csrf.headerName(), csrf.token())
                .cookie(csrf.cookie())
                .content(json(Map.of("email", email, "password", PASSWORD, "displayName", "Test household",
                        "timezone", timezone))))
                .andExpect(status().isCreated())
                .andReturn();
        return session(result, email);
    }

    protected Session login(String email, String password) throws Exception {
        Csrf csrf = csrf();
        MvcResult result = mvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .header(csrf.headerName(), csrf.token())
                .cookie(csrf.cookie())
                .content(json(Map.of("email", email, "password", password))))
                .andExpect(status().isOk())
                .andReturn();
        return session(result, email);
    }

    protected ResultActions refresh(Cookie refreshCookie) throws Exception {
        Csrf csrf = csrf();
        MockHttpServletRequestBuilder request = post("/api/auth/refresh")
                .header(csrf.headerName(), csrf.token());
        request = refreshCookie == null ? request.cookie(csrf.cookie()) : request.cookie(csrf.cookie(), refreshCookie);
        return mvc.perform(request);
    }

    protected static Session session(MvcResult result, String email) throws UnsupportedEncodingException {
        String body = result.getResponse().getContentAsString();
        return new Session(JsonPath.read(body, "$.account.id"), email, JsonPath.read(body, "$.accessToken"),
                result.getResponse().getCookie("pt_refresh"));
    }

    // ---------------------------------------------------------------- requests

    protected <B extends AbstractMockHttpServletRequestBuilder<B>> B authed(B builder, Session session) {
        return builder.header("Authorization", "Bearer " + session.accessToken());
    }

    protected ResultActions getAs(Session session, String url, Object... vars) throws Exception {
        return mvc.perform(authed(get(url, vars), session));
    }

    protected ResultActions postAs(Session session, String url, Object body, Object... vars) throws Exception {
        MockHttpServletRequestBuilder request = authed(post(url, vars), session);
        if (body != null) {
            request = request.contentType(MediaType.APPLICATION_JSON).content(json(body));
        }
        return mvc.perform(request);
    }

    protected ResultActions putAs(Session session, String url, Object body, Object... vars) throws Exception {
        return mvc.perform(authed(put(url, vars), session).contentType(MediaType.APPLICATION_JSON).content(json(body)));
    }

    protected ResultActions deleteAs(Session session, String url, Object... vars) throws Exception {
        return mvc.perform(authed(delete(url, vars), session));
    }

    protected ResultActions upload(Session session, String billId, String filename, String contentType, byte[] bytes)
            throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", filename, contentType, bytes);
        return mvc.perform(authed(multipart("/api/bills/{id}/documents", billId).file(file), session));
    }

    protected String json(Object value) {
        return objectMapper.writeValueAsString(value);
    }

    protected static <T> T read(ResultActions result, String path) throws Exception {
        return JsonPath.read(result.andReturn().getResponse().getContentAsString(), path);
    }

    // ---------------------------------------------------------------- domain helpers

    protected LocalDate today(Session session) throws Exception {
        return LocalDate.parse(read(getAs(session, "/api/account").andExpect(status().isOk()), "$.today"));
    }

    protected String categoryId(Session session, String name) throws Exception {
        List<String> ids = read(getAs(session, "/api/categories"), "$[?(@.name == '" + name + "')].id");
        if (ids.isEmpty()) {
            return read(postAs(session, "/api/categories", Map.of("name", name)).andExpect(status().isCreated()),
                    "$.id");
        }
        return ids.getFirst();
    }

    protected String createProvider(Session session, String name) throws Exception {
        return read(postAs(session, "/api/providers", Map.of("name", name)).andExpect(status().isCreated()), "$.id");
    }

    protected Map<String, Object> billBody(String title, String providerId, String categoryId, String amount,
            LocalDate dueDate) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", title);
        body.put("providerId", providerId);
        body.put("categoryId", categoryId);
        body.put("amount", amount);
        body.put("dueDate", dueDate.toString());
        return body;
    }

    protected String createBill(Session session, String providerId, String categoryId, String amount,
            LocalDate dueDate) throws Exception {
        return read(postAs(session, "/api/bills", billBody("Bill " + amount, providerId, categoryId, amount, dueDate))
                .andExpect(status().isCreated()), "$.id");
    }

    /** A provider plus a starter category, for tests that just need a valid bill. */
    protected String[] providerAndCategory(Session session) throws Exception {
        return new String[] { createProvider(session, "Provider " + UUID.randomUUID().toString().substring(0, 8)),
                categoryId(session, "Electricity") };
    }
}
