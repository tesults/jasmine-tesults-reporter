# Jasmine Tesults Reporter

Report Jasmine test results to Tesults, write them to a local JSON file, or do both in the same run.

## Installation

```sh
npm install --save-dev jasmine-tesults-reporter
```

## Register the reporter

Add the reporter to a Jasmine spec helper:

```js
const tesultsReporter = require('jasmine-tesults-reporter');
jasmine.getEnv().addReporter(tesultsReporter);
```

## Upload results to Tesults

Supply your Tesults target token after Jasmine's `--` separator:

```sh
jasmine -- tesults-target=token
```

Existing target-only configurations continue to upload results as before.

## Write results locally

Use `tesults-output-file` to write the Tesults JSON payload without uploading it:

```sh
jasmine -- tesults-output-file=./test-results/tesults-results.json
```

Parent directories are created automatically. The local payload has an empty `target` value.

`tesults-target` and `tesults-output-file` can be used independently or together. When both are configured, the reporter writes the local payload and uploads the results to Tesults.

The output file can also be supplied through the `TESULTS_OUTPUT_FILE` environment variable. When set to a non-empty value, the environment path overrides the `tesults-output-file` command-line argument for that run.

## GitHub Actions reporting

The [Test Automation Reporting for GitHub Actions](https://github.com/tesults/test-automation-reporting) action supplies `TESULTS_OUTPUT_FILE` automatically. Place the action before the Jasmine test step:

```yaml
- name: Set up test automation reporting
  uses: tesults/test-automation-reporting@v1

- name: Run Jasmine tests
  run: npm test
```

Keep `jasmine-tesults-reporter` registered in your spec helper. A target token is optional.

## Documentation

Documentation is available at https://www.tesults.com/docs.

Jasmine-specific documentation: https://www.tesults.com/docs/jasmine.

## Testing

```sh
npm test
```

## Support

help@tesults.com
