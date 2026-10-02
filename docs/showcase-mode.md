# Showcase Mode

Showcase Mode is a real hosted-compatible product feature for public, sanitized assurance reports. It accepts only explicit server-side allowlisted identifiers, never arbitrary browser-supplied filesystem paths or repository URLs.

Authorized targets currently include Pipeline reference/regression fixtures and Drantis self-analysis.

The controlled comparison removes a real authorization call from the regression source. Drantis reruns the same deterministic engine and reports changed controls, Assurance Cases, findings and evidence kinds. No score delta is fabricated.

Public endpoints explicitly declare public-route intent and apply rate limiting. Reports remain snapshot/version specific and are not permanent security certification.
