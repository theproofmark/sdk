package io.proofmark.showad.access;

/**
 * Result of an access policy evaluation.
 *
 * Action semantics:
 *   - {@link Action#CONTINUE} - run the normal verification pipeline;
 *   - {@link Action#ALLOW}    - skip verification and let the request through;
 *   - {@link Action#REDIRECT} - short-circuit with a redirect to {@link #redirectUrl()}
 *                               (or the default video ad URL when null).
 */
public record AccessPolicy(Action action, String reason, String redirectUrl) {

    public enum Action {
        CONTINUE,
        ALLOW,
        REDIRECT
    }

    public static AccessPolicy cont() {
        return new AccessPolicy(Action.CONTINUE, null, null);
    }

    public static AccessPolicy allow(String reason) {
        return new AccessPolicy(Action.ALLOW, reason, null);
    }

    public static AccessPolicy redirect(String reason, String redirectUrl) {
        return new AccessPolicy(Action.REDIRECT, reason, redirectUrl);
    }
}
