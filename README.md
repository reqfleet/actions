# Reqfleet Tests GitHub Action

This GitHub Action allows you to integrate Reqfleet performance tests directly into your CI/CD workflows. It launches and triggers a specified Reqfleet collection, retrieves the run summary, and can optionally fail the workflow based on defined latency and status code thresholds.

## Features

*   **Automated Test Execution**: Launch and trigger Reqfleet collections from your GitHub Actions workflow.
*   **Performance Monitoring**: Get a summary of your collection run, including latency percentiles and HTTP status code distributions.
*   **Threshold Enforcement**: Automatically fail your workflow if performance metrics (latency, status codes) exceed predefined thresholds.
*   **Cross-Platform Compatibility**: Supports Linux and Windows runners with `amd64` and `arm64` architectures.

## Inputs

| Name                       | Description                                                               | Required | Default     |
| :------------------------- | :------------------------------------------------------------------------ | :------- | :---------- |
| `collection_id`            | The ID of the Reqfleet collection to run.                                 | `true`   |             |
| `api_key`                  | The API key for authenticating with the Reqfleet API.                     | `true`   |             |
| `reqfleet_api_endpoint`    | Custom API endpoint for Reqfleet. If provided, will be set as `REQFLEET_API_ENDPOINT` environment variable. | `false`  |             |
| `fail_on_over_threshold`  | If `true`, the step will fail if any metric exceeds its defined threshold. | `false`  | `true`      |
| `latency_threshold`       | Latency thresholds for `avg`, `p50`, `p90`, `p95`, `p99`, e.g., `"avg:50ms,p90:100ms,p99:150ms"`. | `false`  |             |
| `status_threshold`        | Status code thresholds, e.g., `"200=100%,401<10%"`.                      | `false`  |             |

## Outputs

| Name      | Description                        |
| :-------- | :--------------------------------- |
| `summary` | A human-readable summary of the Reqfleet test results, including run ID, latency, and status codes. |

## Example Usage

To use this action, add a step to your workflow YAML file (e.g., `.github/workflows/main.yml`):

```yaml
name: Reqfleet CI

on:
  push:
    branches:
      - main

jobs:
  reqfleet_tests:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Run Reqfleet Performance Tests
        uses: reqfleet/actions@v1 # Replace @v1 with your action's release tag or commit SHA
        id: reqfleet_run
        with:
          collection_id: 'your-reqfleet-collection-id'
          api_key: ${{ secrets.REQFLEET_API_KEY }}
          reqfleet_api_endpoint: 'https://custom.reqfleet.io' # Optional: Specify a custom API endpoint
          fail_on_over_threshold: true
          latency_threshold: 'avg:100ms,p90:150ms,p95:200ms,p99:300ms' # Example thresholds
          status_threshold: '200=100%,401<10%' # Example thresholds: 100% 200s, less than 10% 401s
      - name: Report Summary
        run: |
          echo "Reqfleet Test Summary:"
          echo "${{ steps.reqfleet_run.outputs.summary }}"
```

### Setting up `REQFLEET_API_KEY`

It is crucial to store your Reqfleet API key securely as a GitHub Secret:

1.  In your GitHub repository, navigate to `Settings` > `Secrets and variables` > `Actions`.
2.  Click on `New repository secret`.
3.  For the `Name`, enter `REQFLEET_API_KEY`.
4.  For the `Secret`, paste your actual Reqfleet API key.
5.  Click `Add secret`.

This secret can then be referenced in your workflow using `${{ secrets.REQFLEET_API_KEY }}` as shown in the example above.
