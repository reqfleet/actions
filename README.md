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
| `fail_on_over_threashold`  | If `true`, the step will fail if any metric exceeds its defined threshold. | `false`  | `true`      |
| `latency_threashold`       | Latency thresholds for `avg`, `p50`, `p90`, `p95`, `p99`, e.g., `"avg:50ms,p50:50ms,p99:100ms"`. | `false`  |             |
| `status_threadshold`       | Status code thresholds, e.g., `"200:100%,400:0%"`.                       | `false`  |             |

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
          fail_on_over_threashold: true
          latency_threashold: 'avg:100ms,p95:200ms,p99:300ms' # Example thresholds
          status_threadshold: '200:100%,401:0%' # Example thresholds: 100% 200s, 0% 401s

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
