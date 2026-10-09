package com.papertrail.security;

import java.util.UUID;

/**
 * The authenticated account, resolved from the access token.
 *
 * @param sessionId the login session (refresh-token family) the token was issued for; may be null for
 *                  tokens issued without one
 */
public record AuthUser(UUID id, UUID sessionId) {
}
