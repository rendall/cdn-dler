import assert = require('assert');
import fs = require('fs');
import cdnDler = require('../index.js');
import rmdir = require('rimraf');
//import R = require('ramda');
import JsDiff = require('diff');
require('colors');


const test_path = 'test/test.html';
const test_js_dir = 'test/js/vendor/';
const test_html = '<html><head><link href="//maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css" rel="stylesheet"><script src="//maxcdn.bootstrapcdn.com/bootstrap/3.3.7/js/bootstrap.min.js"></script><link href="https://maxcdn.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css" rel="stylesheet" integrity="sha384-wvfXpqpZZVQGK6TAh5PVlGOfQNHSoD2xbE+QkPxCAFlNEevoEH3Sl0sibVcOQVnN" crossorigin="anonymous"><script src="http://ajax.aspnetcdn.com/ajax/jquery.dataTables/1.9.4/jquery.dataTables.min.js"></script><script src="https://ajax.googleapis.com/ajax/libs/angularjs/1.6.4/angular.min.js"></script><script src="https://ajax.googleapis.com/ajax/libs/angular_material/1.1.4/angular-material.min.js"></script><script src="https://ajax.googleapis.com/ajax/libs/angular-ui-router/1.0.0-rc.1/angular-ui-router.min.js"></script><script src="https://ajax.googleapis.com/ajax/libs/dojo/1.12.2/dojo/dojo.js"></script><script src="https://ajax.googleapis.com/ajax/libs/ext-core/3.1.0/ext-core.js"></script><script src="https://ajax.googleapis.com/ajax/libs/hammerjs/2.0.8/hammer.min.js"></script><script src="https://cdn.jsdelivr.net/jquery.age/1.1.7/jquery.age.min.js"></script><script src="https://cdn.jsdelivr.net/npm/jquery@3.1.0/dist/jquery.min.js"></script><script src="https://code.jquery.com/jquery-3.2.1.min.js" integrity="sha256-hwg4gsxgFZhOsEEamdOYGBf13FyQuiTwlAQgxVSNgt4=" crossorigin="anonymous"></script><script src="https://example.com/will-not-work.min.js"></script></head><body></body></html>';
const test_html_modified = '<html><head><link href="//maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css" rel="stylesheet"><script src="js/vendor/bootstrap/3.3.7/js/bootstrap.min.js"></script><link href="https://maxcdn.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css" rel="stylesheet" integrity="sha384-wvfXpqpZZVQGK6TAh5PVlGOfQNHSoD2xbE+QkPxCAFlNEevoEH3Sl0sibVcOQVnN" crossorigin="anonymous"><script src="js/vendor/angularjs/1.6.4/angular.min.js"></script><script src="js/vendor/angular_material/1.1.4/angular-material.min.js"></script><script src="js/vendor/angular-ui-router/1.0.0-rc.1/angular-ui-router.min.js"></script><script src="js/vendor/dojo/1.12.2/dojo/dojo.js"></script><script src="js/vendor/ext-core/3.1.0/ext-core.js"></script><script src="js/vendor/hammerjs/2.0.8/hammer.min.js"></script><script src="js/vendor/jquery.age/1.1.7/jquery.age.min.js"></script><script src="js/vendor/jquery@3.1.0/dist/jquery.min.js"></script><script src="js/vendor/jquery/jquery-3.2.1.min.js"></script><script src="https://example.com/will-not-work.min.js"></script></head><body></body></html>';

const test_config: any = {
    js: test_js_dir,
    verbose: false,
    input: test_path,
    outDir: 'test/',
    overwriteOK: true
};

// Mocha at this point just crashed and burned when trying to understand what I am doing, here.
// This is a fast testing suite that'll do the job.

const startModuleTest = (config: any): Promise<cdnDler.HtmlInfo | number> => {
    let file = fs.createWriteStream(test_path);
    try {
        file.write(test_html);
        file.end();
    } catch (error) {
        console.error(error);
    }

    return cdnDler.processFile(test_path, config);
};

const cleanUp = () => {
    if (fs.existsSync(test_path)) fs.unlinkSync(test_path);
    if (fs.existsSync(test_js_dir)) rmdir(test_js_dir, (error: Error) => { if (error != null) console.error(error) });
};

const runTestSuite = (message: string, suite: Function, config: any = test_config) =>
    startModuleTest(config)
        .then((a: any) => { suite(a); return a; })
        .then((a: any) => { cleanUp(); return a; })
        .then((a: any) => { console.log(`${message} complete.`); return a; });


const doTest = (message: string, actual: any, expected: any) => {
    try {

        const isUnequalStrings = actual != expected && typeof actual == "string" && typeof expected == "string";

        if (isUnequalStrings) {
            const diff: JsDiff.IDiffResult[] = JsDiff.diffChars(expected, actual);

            const diffColor: any = (part: any) => part.added ? part.value['green'] : part.removed ? part.value['red'] : part.value['grey'];
            const diffString: any = (diff: JsDiff.IDiffResult[], msg: string = "", i: number = 0) =>
                i >= diff.length ? msg : diffString(diff, msg + diffColor(diff[i]), i + 1);

            console.log(diffString(diff));
        }
        assert.equal(actual, expected, message);

    } catch (e) {
        console.error(e);
    }
}

const protypicalUseCase_Suite = (info: cdnDler.HtmlInfo) => {
    doTest("html should be modified properly", info.modifiedHtml, test_html_modified);
    info.paths.forEach((path: string) => doTest(`should exist: ${path}`, true, fs.existsSync(path)));

    return info;
}

const dirdotWarning_Suite = (info: cdnDler.HtmlInfo) => info;

export const test = () => {
    runTestSuite("Protypical use case test", protypicalUseCase_Suite).catch((e: Error) => { throw e; });
    runTestSuite("Dirdot Warning", dirdotWarning_Suite, { input: test_path, outDir: 'test/', overwriteOK:true, cdnMap: [[/code\.jquery\.com\//, "./jquery./"]] })
        .then(() => {
            assert.ok(false, "Should have thrown a Dirdot Error, but did not.");
            return 0;
        })
        .catch((err: Error) => {
            assert.ok(err.message.startsWith("Dirdot"), `This should be a Dirdot Error but is "${err.message}"`);
            console.log("Dirdot failsafe test complete.");
            return 1;
        });

    return "Testing suite";
    // A directory with a . at the end of the name (e.g. the jquery./ in "js/vendor/jquery./jquery-min.js") will be difficult to delete. This test tests the mechanism that prevents that.
}

require('make-runnable/custom')({
    printOutputFrame: false
})
