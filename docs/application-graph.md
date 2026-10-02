# Application Security Graph

The typed graph models Routes, Middleware, ServerActions, AuthenticationBoundaries, AuthorizationPolicies, ValidationBoundaries, RateLimits, Services, Repositories, Databases, Tables, RLSPolicies, Storage, External APIs, AI Providers, Secrets, Queues, User Roles, Environment Variables, Tests and Deployment components.

Relationships include CALLS, READS, WRITES, AUTHENTICATES_THROUGH, AUTHORIZED_BY, VALIDATED_BY, RATE_LIMITED_BY, DEPENDS_ON, EXPOSES, TRUSTS, TESTED_BY and DEPLOYED_BY.

Every edge carries evidence provenance. Current graph construction is source-unit aware and conservative. Interprocedural import/call resolution remains a depth expansion rather than something Drantis claims today.
