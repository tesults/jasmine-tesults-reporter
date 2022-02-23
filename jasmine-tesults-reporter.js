const fs = require('fs');
const path = require('path');
const tesults = require('tesults');

let data = {
    target: 'token',
    results: {
        cases: []
    }
};
  
let startTimes = {};

let args = {};
let disabled = false;

const targetKey = "tesults-target";
const filesKey = "tesults-files";
const configKey = "tesults-config";
const buildNameKey = "tesults-build-name";
const buildDescKey = "tesults-build-desc";
const buildResultKey = "tesults-build-result";
const buildReasonKey = "tesults-build-reason";
  
const caseFiles = (suite, name) => {
    let files = [];
    if (args['tesults-files'] !== undefined) {
      try {
        const filesPath = path.join(args['tesults-files'], suite, name);
        fs.readdirSync(filesPath).forEach(function (file) {
            if (file !== ".DS_Store") { // Exclude os files
                files.push(path.join(filesPath, file));
            }
        });
      } catch (err) { 
        if (err.code === 'ENOENT') {
            // Normal scenario where no files present: console.log('Tesults error reading case files, check supplied tesults-files arg path is correct.');
        } else {
            console.log('Tesults error reading case files.')
        }
      }
    }
    return files;
}

const tesultsReporter = {
    jasmineStarted: (suiteInfo) => {
        process.argv.forEach((val, index) => {
            if (val.indexOf(targetKey) === 0) {
                args[targetKey] = val.substr(targetKey.length + 1);
            }
            if (val.indexOf(filesKey) === 0) {
                args[filesKey] = val.substr(filesKey.length + 1);
            }
            if (val.indexOf(configKey) === 0) {
                args[configKey] = val.substr(configKey.length + 1);
            }
            if (val.indexOf(buildNameKey) === 0) {
                args[buildNameKey] = val.substr(buildNameKey.length + 1);
            }
            if (val.indexOf(buildDescKey) === 0) {
                args[buildDescKey] = val.substr(buildDescKey.length + 1);
            }
            if (val.indexOf(buildResultKey) === 0) {
                args[buildResultKey] = val.substr(buildResultKey.length + 1);
            }
            if (val.indexOf(buildReasonKey) === 0) {
                args[buildReasonKey] = val.substr(buildReasonKey.length + 1);
            }
        });
    
        if (args[targetKey] === undefined) {
            console.log(targetKey + " not provided. Tesults disabled.");
            disabled = true;
            return;
        }
    },
  
    suiteStarted: (result) => {
        // Not used
    },
  
    specStarted: (result) => {
        if (disabled === true) {
            return;
        }
        startTimes[result.id.toString()] = Date.now();
    },
  
    specDone: (result) => {
        if (disabled === true) {
            return;
        }
        let testCase = {};
        testCase.name = result.description.trim();
        testCase.duration = result.duration;
        testCase.rawResult = result.status;
        let suite = result.fullName.trim();
        let index = suite.lastIndexOf(testCase.name);
        if (index > -1) {
            testCase.suite = suite.substring(0, index).trim();
        } else {
            testCase.suite = result.fullName.trim();
        }
        if (result.passedExpectations !== undefined) {
            if (Array.isArray(result.passedExpectations)) {
                try {
                    testCase["_Passed expectations"] = JSON.stringify(result.passedExpectations);
                } catch (err) {
                    // Unable to save
                }
            }
        }
        if (result.deprecationWarnings !== undefined) {
            if (Array.isArray(result.deprecationWarnings)) {
                try {
                    testCase["_Deprecation warnings"] = JSON.stringify(result.deprecationWarnings);
                } catch (err) {
                    // Unable to save
                }
            }
        }
        if (result.debugLogs !== undefined) {
            if (Array.isArray(result.debugLogs)) {
                try {
                    testCase["_Debug logs"] = JSON.stringify(result.debugLogs);
                } catch (err) {
                    // Unable to save
                }
            }
        }
        if (result.properties !== undefined && result.properties !== null) {
            Object.keys(result.properties).forEach((key) => {
                testCase["_" + key] = result.properties[key];
            })
        }
        if (result.pendingReason !== undefined) {
            testCase["_Pending reason"] = result.pendingReason;
        }
        if (result.status === "passed") {
            testCase.result = "pass";
        } else if (result.status === "failed") {
            testCase.result = "fail";
            if (result.failedExpectations !== undefined) {
                if (Array.isArray(result.failedExpectations)) {
                    try {
                        testCase.reason = JSON.stringify(result.failedExpectations);
                    } catch (err) {
                        // Unable to save this failure reason
                    }
                }
            }
        } else {
            testCase.result = "unknown";
        }
        
        let files = caseFiles(testCase.suite, testCase.name);
        if (files.length > 0) {
            testCase.files = files;
        }
        testCase.start = startTimes[result.id.toString()];
        testCase.end = Date.now();
        data.results.cases.push(testCase);
    },
  
    suiteDone: (result) => {
        // Not used
    },
  
    jasmineDone: (result, done) => {
        if (disabled === true) {
            return;
        }
      
        // build case
        if (args[buildNameKey] !== undefined) {
            let buildCase = {suite: "[build]"};
            buildCase.name = args[buildNameKey];
            if (buildCase.name === "") {
                buildCase.name = "-";
            }
            if (args[buildDescKey] !== undefined) {
                buildCase.desc = args[buildDescKey];
            }
            if (args[buildReasonKey] !== undefined) {
                buildCase.reason = args[buildReasonKey];
            }
            if (args[buildResultKey] !== undefined) {
                buildCase.result = args[buildResultKey].toLowerCase();
                if (buildCase.result !== "pass" && buildCase.result !== "fail") {
                buildCase.result = "unknown";
                }
            } else {
                buildCase.result = "unknown";
            }
            let files = caseFiles(buildCase.suite, buildCase.name);
            if (files.length > 0) {
                buildCase.files = files;
            }
            data.results.cases.push(buildCase);
        }
    
        // Tesults upload
        data.target = args[targetKey];
        console.log('Tesults results upload...');
        tesults.results(data, function (err, response) {
            if (err) {
                console.log('Tesults library error, failed to upload.');
            } else {
                console.log('Success: ' + response.success);
                console.log('Message: ' + response.message);
                console.log('Warnings: ' + response.warnings.length);
                console.log('Errors: ' + response.errors.length);

                for(let i = 0; i < response.warnings.length; i++) {
                    console.timeLog(response.warnings[i])
                }
            }
            done()
        });
    }
  };

  module.exports = tesultsReporter;