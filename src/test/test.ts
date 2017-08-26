import assert = require('assert');
import fs = require('fs');
import mkdirp = require('mkdirp');
import cdnler = require('../index.js');
import rmdir = require('rimraf');
import R = require('ramda');
import JsDiff = require('diff');
require('colors');

class TestSuite {
    name: string;
    purpose: string;
    config: cdnler.Config;
    setup: (ts: TestSuite) => Promise<boolean>;
    evaluate: (info: cdnler.HtmlInfo[]) => Promise<boolean>; // return 'true' if all tests pass
    reject: (error: any) => void;
    cleanup: () => Promise<boolean>;
}

const test_dir = 'test/testdir'
const test_path = `${test_dir}/test.html`;
const test_js_dir = `${test_dir}/js/vendor/`;
const test_html = '<html><head><link href="//maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css" rel="stylesheet"><script src="//maxcdn.bootstrapcdn.com/bootstrap/3.3.7/js/bootstrap.min.js"></script><link href="https://maxcdn.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css" rel="stylesheet" integrity="sha384-wvfXpqpZZVQGK6TAh5PVlGOfQNHSoD2xbE+QkPxCAFlNEevoEH3Sl0sibVcOQVnN" crossorigin="anonymous"><script src="http://ajax.aspnetcdn.com/ajax/jquery.dataTables/1.9.4/jquery.dataTables.min.js"></script><script src="https://ajax.googleapis.com/ajax/libs/angularjs/1.6.4/angular.min.js"></script><script src="https://ajax.googleapis.com/ajax/libs/angular_material/1.1.4/angular-material.min.js"></script><script src="https://ajax.googleapis.com/ajax/libs/angular-ui-router/1.0.0-rc.1/angular-ui-router.min.js"></script><script src="https://ajax.googleapis.com/ajax/libs/dojo/1.12.2/dojo/dojo.js"></script><script src="https://ajax.googleapis.com/ajax/libs/ext-core/3.1.0/ext-core.js"></script><script src="https://ajax.googleapis.com/ajax/libs/hammerjs/2.0.8/hammer.min.js"></script><script src="https://cdn.jsdelivr.net/jquery.age/1.1.7/jquery.age.min.js"></script><script src="https://cdn.jsdelivr.net/npm/jquery@3.1.0/dist/jquery.min.js"></script><script src="https://code.jquery.com/jquery-3.2.1.min.js" integrity="sha256-hwg4gsxgFZhOsEEamdOYGBf13FyQuiTwlAQgxVSNgt4=" crossorigin="anonymous"></script><script src="https://d3js.org/d3.v4.min.js"></script><script src="https://example.com/will-not-work.min.js"></script></head><body></body></html>';
const test_html_modified = '<html><head><link href="//maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css" rel="stylesheet"><script src="js/vendor/bootstrap/3.3.7/js/bootstrap.min.js"></script><link href="https://maxcdn.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css" rel="stylesheet" integrity="sha384-wvfXpqpZZVQGK6TAh5PVlGOfQNHSoD2xbE+QkPxCAFlNEevoEH3Sl0sibVcOQVnN" crossorigin="anonymous"><script src="js/vendor/angularjs/1.6.4/angular.min.js"></script><script src="js/vendor/angular_material/1.1.4/angular-material.min.js"></script><script src="js/vendor/angular-ui-router/1.0.0-rc.1/angular-ui-router.min.js"></script><script src="js/vendor/dojo/1.12.2/dojo/dojo.js"></script><script src="js/vendor/ext-core/3.1.0/ext-core.js"></script><script src="js/vendor/hammerjs/2.0.8/hammer.min.js"></script><script src="js/vendor/jquery.age/1.1.7/jquery.age.min.js"></script><script src="js/vendor/jquery@3.1.0/dist/jquery.min.js"></script><script src="js/vendor/jquery/jquery-3.2.1.min.js"></script><script src="js/vendor/d3.v4.min.js"></script><script src="https://example.com/will-not-work.min.js"></script></head><body></body></html>';
const test_config: any = {
    js: test_js_dir,
    verbose: false,
    input: test_path,
    outDir: test_dir,
    overwriteOK: true
};

// General test suite helper utilities
const readFile = (file: string) => new Promise(
    (resolve: Function, reject: Function) =>
        fs.readFile(file, 'utf8', (err, data) => err == null ? resolve(data) : reject(err)));

const fileExists = (file: string) => new Promise<boolean>(
    (resolve: Function) =>
        fs.exists(file, (exists: boolean) => resolve(exists)));

const removeDir = (dir: string) => new Promise<boolean>((resolve: Function, reject: Function) => {
    return fileExists(dir).then((exists) => exists ?
        rmdir(dir, (error: Error) => { error == null ? resolve(true) : reject(error) })
        : resolve(true));
});

const makeDir = (dir: string) => new Promise<boolean>((resolve: Function, reject: Function) =>
    fileExists(dir)
        .then((isExists: boolean) => isExists ? resolve(true) : mkdirp(dir, (error: Error) => error == null ? resolve(true) : reject(error))));

const log = (msg: any, ...a: any[]) => new Promise<any>((resolve) => {
    console.log(msg, ...a);
    resolve(msg);
});

const writeFile = (path: string, content: string) => new Promise<boolean>((resolve: Function, reject: Function) => {
    let file = fs.createWriteStream(path);
    const onWritten = () => {
        file.end();
        resolve(true);
    }
    try {
        file.write(content, 'utf8', onWritten);
    } catch (error) {
        reject(error);
    }
});

const colorStr = (color: string, str: any): string => str[color];
const green = R.curry(colorStr)('green');
const red = R.curry(colorStr)('red');

// General test suite functions
const start = (ts: TestSuite) => new Promise((resolve) => {
    log(`${ts.name}: ${ts.purpose}`).then(() => resolve(true));
});

const complete = (ts: TestSuite) => new Promise((resolve) => {
    log(`${ts.name} completed`).then(() => resolve(true));
});

const defaultSetup = (ts: TestSuite) => new Promise<boolean>((resolve, reject) =>
    log('')
        .then(ts.cleanup) // run the test suite's cleanup first.
        .then(() => makeDir(test_dir))
        .then(() => writeFile(test_path, test_html))
        .then(() => resolve(true))
        .catch((err) => reject(err)));

const defaultReject = (reason: any) => {
    console.log("Error occured during run:", reason);

}

const defaultCleanup = () => new Promise<boolean>((resolve, reject) => {
    removeDir(test_dir).then((isSuccess: boolean) => resolve(isSuccess), (reason) => reject(reason))
});

const runTestSuite = (ts: TestSuite) => new Promise<boolean>((resolve, reject) => {
    start(ts)
        .then(ts.setup)
        .then(() => cdnler.run(ts.config))
        .then(ts.evaluate, ts.reject)
        .catch((reason) => { console.error(red(`${ts.name} Error: ${reason}`)); throw Error(reason); })
        .then(() => complete(ts))
        .then(ts.cleanup)
        .then(() => resolve(true))
        .catch(() => resolve(false));
});

const displayResults = (tests: TestSuite[], results: boolean[], i = 0) => {

    if (i >= tests.length) return;

    console.log(`${tests[i].name}\t${results[i] ? green('ok') : red('fail')}`);

    displayResults(tests, results, i + 1);


}

// Use this evaluation when the evaluation should error.
const evaluateMustError = (errorMessage: string) => (info: cdnler.HtmlInfo[] | cdnler.HtmlInfo) => new Promise<boolean>((resolve, reject) => {
    reject(errorMessage);
});
const rejectionIsOK = (expected:string) => (reason: any) => {
    const errMessage:string = R.has('message', reason) ? reason.message : reason;
    if (!errMessage.startsWith(expected))  throw reason;
}
// Specific tests.

// Prototypical Use Case Test Suite.
// return 'true' only if all tests pass
const evaluatePrototypeRun = (info: cdnler.HtmlInfo[] | cdnler.HtmlInfo) => new Promise<boolean>((resolve, reject) => {
    if (Array.isArray(info)) {
        const onResolve = (a: any) => resolve(a);
        const onReject = (e: any) => reject(e);
        Promise.all(R.map(evaluatePrototypeRun)(info)).then(onResolve, onReject);
    }
    else {
        // Place tests here.
        info.data.forEach((d, i) => assert.notEqual('fileData', d, `debug info in ${info.paths[i]}`));
        assert.equal(info.modifiedHtml, test_html_modified, `${info.writeFile} modified unexpectedly`);


        resolve(true);
    }

});



export const test = (params?: any) => {

    const proto: TestSuite = {
        name: "Prototype use case",
        purpose: "A straight run of cdnler's typical use.",
        config: R.merge(test_config, params),
        evaluate: evaluatePrototypeRun,
        reject: defaultReject,
        setup: defaultSetup,
        cleanup: defaultCleanup
    };

    // create a test that makes sure /directory./ (dirdot) does not happen.
    const dirDot: TestSuite = {
        name: "dir./ prevention",
        purpose: "Prevent an accidental dot at the end of a directory name",
        config: R.merge(test_config, { js: `${test_dir}/js/vendor./` }),
        evaluate: evaluateMustError("This should not have passed. Dirdot was not captured."),
        reject: rejectionIsOK("Dirdot:"),
        setup: defaultSetup,
        cleanup: defaultCleanup
    };


    // create a test to make sure that external config file works.
    // test glob input
    // test input as [] array

    // support css and other assets
    // support fallback

    const suites = [proto, dirDot];

    Promise.all(R.map(runTestSuite)(suites)).then((a) => { console.log('Suite test results:'); return a }).then((a) => displayResults(suites, a));
    return '';
};

require('make-runnable/custom')({
    printOutputFrame: false
})
