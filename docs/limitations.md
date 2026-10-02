# Limitations

Drantis does **not** prove that an application is secure.

A report can only describe evidence available for the identified repository snapshot, policy, Drantis version, analyzer versions, scanner inputs and explicitly authorized verification runs.

## Static-analysis limits

The built-in TypeScript/JavaScript analyzer uses syntax-tree-aware inspection but is not a complete interprocedural theorem prover. It may miss authorization delegated through wrappers, framework abstractions, generated code, indirect dependency behavior or runtime-only policy. It may also conservatively flag a route whose protection is enforced elsewhere.

## Scanner limits

Semgrep, Gitleaks, OSV and Trivy adapters normalize supplied scanner results. Coverage is bounded by the scanner, rules/database version and inputs. Absence of a scanner finding is not proof of absence of vulnerabilities or secrets.

## Verification limits

`VERIFIED` means a configured deterministic check capable of testing the stated guarantee ran in the authorized isolated runner and produced the expected machine outcome. It does not mean every possible attack path was tested. The quality of a verification claim still depends on the verification command and fixture design.

## AI limits

Model output is explanatory only. Models can be wrong, prompt-injected or incomplete. Drantis therefore prevents AI output from changing controls, Assurance Case states or release decisions.

## Infrastructure limits

Static source inspection does not automatically validate the deployed cloud account, firewall, runtime identity, production database contents, third-party service configuration or future commits.

## Certification

A Drantis report or Labs badge is not permanent certification, compliance attestation, penetration test, warranty, or guarantee.
