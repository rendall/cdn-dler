import assert = require('assert');
import fs = require('fs');
import cdnDler = require('../index.js');
import rmdir = require('rimraf');
import R = require('ramda');


const test_html = '<html><head><link href="//maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css" rel="stylesheet"><script src="//maxcdn.bootstrapcdn.com/bootstrap/3.3.7/js/bootstrap.min.js"></script><link href="https://maxcdn.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css" rel="stylesheet" integrity="sha384-wvfXpqpZZVQGK6TAh5PVlGOfQNHSoD2xbE+QkPxCAFlNEevoEH3Sl0sibVcOQVnN" crossorigin = "anonymous" > <script src="https://ajax.googleapis.com/ajax/libs/angularjs/1.6.4/angular.min.js" > </script><script src="https://ajax.googleapis.com/ajax/libs/angular_material/1.1.4/angular-material.min.js"></script><script src="https://ajax.googleapis.com/ajax/libs/angular-ui-router/1.0.0-rc.1/angular-ui-router.min.js"></script><script src="https://ajax.googleapis.com/ajax/libs/dojo/1.12.2/dojo/dojo.js"></script><script src="https://ajax.googleapis.com/ajax/libs/ext-core/3.1.0/ext-core.js"></script><script src="https://ajax.googleapis.com/ajax/libs/hammerjs/2.0.8/hammer.min.js"></script><script src="https://example.com/will-not-work.min.js"></script></head><body></body>';
const test_path = 'test/test.html';
const test_js_dir = 'test/js/vendor/';
const test_html_modified = '<html><head><link href="//maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css" rel="stylesheet"><script src="js/vendor/bootstrap/3.3.7/js/bootstrap.min.js"></script><link href="https://maxcdn.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css" rel="stylesheet" integrity="sha384-wvfXpqpZZVQGK6TAh5PVlGOfQNHSoD2xbE+QkPxCAFlNEevoEH3Sl0sibVcOQVnN" crossorigin = "anonymous" > <script src="js/vendor/angularjs/1.6.4/angular.min.js"></script><script src="js/vendor/angular_material/1.1.4/angular-material.min.js"></script><script src="js/vendor/angular-ui-router/1.0.0-rc.1/angular-ui-router.min.js"></script><script src="js/vendor/dojo/1.12.2/dojo/dojo.js"></script><script src="js/vendor/ext-core/3.1.0/ext-core.js"></script><script src="js/vendor/hammerjs/2.0.8/hammer.min.js"></script><script src="https://example.com/will-not-work.min.js"></script></head><body></body>';

const test_config: cdnDler.CdnDlerConfig = {
    jsDir: test_js_dir,
    cdnMap: [
        [/maxcdn\.bootstrapcdn\.com\//, "./"],
        [/code\.jquery\.com\//, "./jquery/"],
        [/ajax\.googleapis\.com\/ajax\/libs\//, './']
    ],
    downloadOK: true,
    overwriteOK: true,
    mkdirOK: true
};



// Mocha at this point just crashed and burned when trying to understand what I am doing, here.
// This is a fast testing suite that'll do the job.

const startModuleTest = (config: cdnDler.CdnDlerConfig): Promise<cdnDler.HtmlInfo | number> => {
    let file = fs.createWriteStream(test_path);
    try {
        file.write(test_html);
        file.end();
    } catch (error) {
        console.error(error);
    }

    return cdnDler.processFile(test_path, config);
};

const afterSuiteRun = () => {
    if (fs.existsSync(test_path)) fs.unlinkSync(test_path);
    if (fs.existsSync(test_js_dir)) rmdir(test_js_dir, (error: Error) => console.error(error));
};

const runTestSuite = (message: string, suite: Function, config: cdnDler.CdnDlerConfig = test_config) => {
    startModuleTest(config) 
        .catch((err: any) => console.error("Error:", err))
        .then((a: any) => { console.log(`-----------\nTest suite: ${message}\n-----------`); return a; })
        .then((a: any) => { suite(a); return a; })
        .then((a: any) => { afterSuiteRun(); return a; })
        .then((a: any) => console.log(`-----------\nComplete run: ${message}\n-----------\n`))
}

const doTest = (message: string, result: any, expected: any) => {
    try {
        console.assert(expected == result, message, result);
    } catch (e) {
        console.error(e);
    }
}

const protypicalUseCase_Suite = (info: cdnDler.HtmlInfo) => {
    doTest("html should be modified properly", info.modifiedHtml, test_html_modified);
    info.paths.forEach((path: string) => doTest(`should exist: ${path}`, true, fs.existsSync(path)));
}

export const test = () => {
    runTestSuite("Protypical use case", protypicalUseCase_Suite);
}

require('make-runnable');
