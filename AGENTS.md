# Best Practices for Developing GitHub Actions

Developing robust, secure, and efficient GitHub Actions requires adherence to several key best practices. These guidelines focus on ensuring the action's reliability, protecting sensitive data, optimizing execution, and promoting reusability.

## 1. Security Best Practices

Security is paramount to prevent vulnerabilities and supply chain attacks.

*   **Secure Secret Management:**
    *   **Never hardcode secrets:** Always use GitHub's encrypted secrets.
    *   **Prefer OpenID Connect (OIDC):** For authentication to cloud providers, use OIDC instead of long-lived credentials.
    *   **Least-privileged `GITHUB_TOKEN`:** Explicitly define minimum necessary permissions for the `GITHUB_TOKEN`.
    *   **Avoid printing secrets in logs:** Even with redaction, sensitive data can leak.
    *   **No structured data for secrets:** Do not encapsulate secrets in JSON, XML, or YAML within logs.

*   **Control Third-Party Actions:**
    *   **Policy enforcement:** Allow only authorized third-party Actions.
    *   **Review and fork risky actions:** Assess third-party actions for vulnerabilities and consider forking for better control.
    *   **Pin to full-length commit SHA:** Use immutable commit SHAs (e.g., `actions/checkout@v3` should be `actions/checkout@a127a94`).

*   **Prevent Script Injection:**
    *   **Avoid direct untrusted input:** Do not execute untrusted input directly in scripts (e.g., from `github-context` objects). Use intermediate environment variables.
    *   **Prefer tested Actions:** Use well-tested GitHub Actions over inline scripts when possible.

*   **Secure Workflow Change Management:**
    *   **Run on trusted code:** Execute sensitive workflows only on peer-reviewed, merged code, not directly from untrusted pull requests.
    *   **Branch protection and CODEOWNERS:** Enforce review processes and define ownership for workflow changes.
    *   **Disable workflow runs from forks:** If not required, disable runs from forked repositories or require manual approval.

*   **Self-Hosted Runners:**
    *   **Avoid in public repos:** Do not use self-hosted runners in public repositories due to significant security risks.
    *   **Secure infrastructure & ephemeral runners:** Secure the underlying infrastructure and use ephemeral runners for clean environments.

## 2. Performance Best Practices

Optimizing performance reduces execution time and costs.

*   **Keep Actions Minimal:**
    *   **Lightweight design:** Design actions to be as small as possible.
    *   **Minimal Docker images:** Use light images (e.g., `alpine`) and install only essential dependencies.
    *   **Bundle dependencies:** For Node.js actions, publish `node_modules` with the action.

*   **Leverage Caching:**
    *   **Cache dependencies:** Use `actions/cache` for `node_modules`, `pip` packages, etc., to speed up subsequent runs.
    *   **Effective cache keys:** Use appropriate cache keys and manage cache size.

*   **Optimize Parallelism:**
    *   **Matrix builds:** Use matrix strategies to run tests across different environments in parallel.
    *   **Distribute tasks:** Effectively distribute tasks across parallel jobs.

*   **Reduce Trigger Frequency:**
    *   **Conditional triggers:** Use specific branches or file path changes to trigger workflows only when necessary.

## 3. Maintainability and Reusability Best Practices

Well-structured and reusable Actions lead to more efficient development and easier management.

*   **Reusable Workflows and Composite Actions:**
    *   **Centralize shared processes:** Use reusable workflows and composite actions to avoid duplicating configurations.
    *   **Dedicated repository:** Store reusable workflows in a single, dedicated repository for easier maintenance.
    *   **Version control:** Version reusable workflows using specific tags, branches, or commit SHAs.

*   **Scope Environment Variables:**
    *   **Narrowest scope:** Limit environment variables to the job or step level to improve readability and prevent global pollution.

*   **Author Metadata:**
    *   **Include author information:** Add author details in action metadata for better code ownership and maintenance.

*   **Naming Conventions:**
    *   **Specific and unambiguous:** Use clear, concise names that describe the action's function.
    *   **Consistent terminology:** Maintain consistency in naming across actions.