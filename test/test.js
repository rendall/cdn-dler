"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var assert = require("assert");
var fs = require("fs");
var mkdirp = require("mkdirp");
var cdnler = require("../index.js");
var rmdir = require("rimraf");
var R = require("ramda");
require('colors');
var TestSuite = (function () {
    function TestSuite() {
    }
    return TestSuite;
}());
var test_dir = 'test/testdir';
var test_path = test_dir + "/test.html";
var test_js_dir = test_dir + "/js/vendor/";
var test_html = '<html><head><link href="//maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css" rel="stylesheet"><script src="//maxcdn.bootstrapcdn.com/bootstrap/3.3.7/js/bootstrap.min.js"></script><link href="https://maxcdn.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css" rel="stylesheet" integrity="sha384-wvfXpqpZZVQGK6TAh5PVlGOfQNHSoD2xbE+QkPxCAFlNEevoEH3Sl0sibVcOQVnN" crossorigin="anonymous"><script src="http://ajax.aspnetcdn.com/ajax/jquery.dataTables/1.9.4/jquery.dataTables.min.js"></script><script src="https://ajax.googleapis.com/ajax/libs/angularjs/1.6.4/angular.min.js"></script><script src="https://ajax.googleapis.com/ajax/libs/angular_material/1.1.4/angular-material.min.js"></script><script src="https://ajax.googleapis.com/ajax/libs/angular-ui-router/1.0.0-rc.1/angular-ui-router.min.js"></script><script src="https://ajax.googleapis.com/ajax/libs/dojo/1.12.2/dojo/dojo.js"></script><script src="https://ajax.googleapis.com/ajax/libs/ext-core/3.1.0/ext-core.js"></script><script src="https://ajax.googleapis.com/ajax/libs/hammerjs/2.0.8/hammer.min.js"></script><script src="https://cdn.jsdelivr.net/jquery.age/1.1.7/jquery.age.min.js"></script><script src="https://cdn.jsdelivr.net/npm/jquery@3.1.0/dist/jquery.min.js"></script><script src="https://code.jquery.com/jquery-3.2.1.min.js" integrity="sha256-hwg4gsxgFZhOsEEamdOYGBf13FyQuiTwlAQgxVSNgt4=" crossorigin="anonymous"></script><script src="https://d3js.org/d3.v4.min.js"></script><script src="https://example.com/will-not-work.min.js"></script></head><body></body></html>';
var test_html_modified = '<html><head><link href="//maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css" rel="stylesheet"><script src="js/vendor/bootstrap/3.3.7/js/bootstrap.min.js"></script><link href="https://maxcdn.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css" rel="stylesheet" integrity="sha384-wvfXpqpZZVQGK6TAh5PVlGOfQNHSoD2xbE+QkPxCAFlNEevoEH3Sl0sibVcOQVnN" crossorigin="anonymous"><script src="js/vendor/angularjs/1.6.4/angular.min.js"></script><script src="js/vendor/angular_material/1.1.4/angular-material.min.js"></script><script src="js/vendor/angular-ui-router/1.0.0-rc.1/angular-ui-router.min.js"></script><script src="js/vendor/dojo/1.12.2/dojo/dojo.js"></script><script src="js/vendor/ext-core/3.1.0/ext-core.js"></script><script src="js/vendor/hammerjs/2.0.8/hammer.min.js"></script><script src="js/vendor/jquery.age/1.1.7/jquery.age.min.js"></script><script src="js/vendor/jquery@3.1.0/dist/jquery.min.js"></script><script src="js/vendor/jquery/jquery-3.2.1.min.js"></script><script src="js/vendor/d3.v4.min.js"></script><script src="https://example.com/will-not-work.min.js"></script></head><body></body></html>';
var test_config = {
    js: test_js_dir,
    verbose: false,
    input: test_path,
    outDir: test_dir,
    overwriteOK: true
};
var readFile = function (file) { return new Promise(function (resolve, reject) {
    return fs.readFile(file, 'utf8', function (err, data) { return err == null ? resolve(data) : reject(err); });
}); };
var fileExists = function (file) { return new Promise(function (resolve) {
    return fs.exists(file, function (exists) { return resolve(exists); });
}); };
var removeDir = function (dir) { return new Promise(function (resolve, reject) {
    return fileExists(dir).then(function (exists) { return exists ?
        rmdir(dir, function (error) { error == null ? resolve(true) : reject(error); })
        : resolve(true); });
}); };
var makeDir = function (dir) { return new Promise(function (resolve, reject) {
    return fileExists(dir)
        .then(function (isExists) { return isExists ? resolve(true) : mkdirp(dir, function (error) { return error == null ? resolve(true) : reject(error); }); });
}); };
var log = function (msg) {
    var a = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        a[_i - 1] = arguments[_i];
    }
    return new Promise(function (resolve) {
        console.log.apply(console, [msg].concat(a));
        resolve(msg);
    });
};
var writeFile = function (path, content) { return new Promise(function (resolve, reject) {
    var file = fs.createWriteStream(path);
    var onWritten = function () {
        file.end();
        resolve(true);
    };
    try {
        file.write(content, 'utf8', onWritten);
    }
    catch (error) {
        reject(error);
    }
}); };
var colorStr = function (color, str) { return str[color]; };
var green = R.curry(colorStr)('green');
var red = R.curry(colorStr)('red');
var start = function (ts) { return new Promise(function (resolve) {
    log(ts.name + ": " + ts.purpose).then(function () { return resolve(true); });
}); };
var complete = function (ts) { return new Promise(function (resolve) {
    log(ts.name + " completed").then(function () { return resolve(true); });
}); };
var defaultSetup = function (ts) { return new Promise(function (resolve, reject) {
    return log('')
        .then(ts.cleanup)
        .then(function () { return makeDir(test_dir); })
        .then(function () { return writeFile(test_path, test_html); })
        .then(function () { return resolve(true); })
        .catch(function (err) { return reject(err); });
}); };
var defaultCleanup = function () { return new Promise(function (resolve, reject) {
    removeDir(test_dir).then(function (isSuccess) { return resolve(isSuccess); }, function (reason) { return reject(reason); });
}); };
var runTestSuite = function (ts) { return new Promise(function (resolve, reject) {
    start(ts)
        .then(ts.setup)
        .then(function () { return cdnler.run(ts.config); })
        .then(ts.evaluate)
        .catch(function (err) { return console.error(err); })
        .then(function () { return complete(ts); })
        .then(ts.cleanup)
        .then(function () { return resolve(true); })
        .catch(function () { return resolve(false); });
}); };
var evaluatePrototypeRun = function (info) { return new Promise(function (resolve, reject) {
    if (Array.isArray(info)) {
        var onResolve = function (a) { return resolve(a); };
        var onReject = function (e) { return reject(e); };
        Promise.all(R.map(evaluatePrototypeRun)(info)).then(onResolve, onReject);
    }
    else {
        info.data.forEach(function (d, i) { return assert.notEqual('fileData', d, "debug info in " + info.paths[i]); });
        assert.equal(info.modifiedHtml, test_html_modified, info.writeFile + " modified unexpectedly");
        resolve(true);
    }
}); };
var displayResults = function (tests, results, i) {
    if (i === void 0) { i = 0; }
    if (i >= tests.length)
        return;
    console.log(tests[i].name + "\t" + (results[i] ? green('ok') : red('fail')));
    displayResults(tests, results, i + 1);
};
exports.test = function (params) {
    var proto = {
        name: "Prototype use case",
        purpose: "A straight run of cdnler's typical use.",
        config: R.merge(test_config, params),
        evaluate: evaluatePrototypeRun,
        setup: defaultSetup,
        cleanup: defaultCleanup
    };
    var suites = [proto];
    Promise.all(R.map(runTestSuite)(suites)).then(function (a) { console.log('Suite test results:'); return a; }).then(function (a) { return displayResults(suites, a); });
    return '';
};
require('make-runnable/custom')({
    printOutputFrame: false
});
//# sourceMappingURL=test.js.map