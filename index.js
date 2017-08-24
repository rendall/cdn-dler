"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var R = require("ramda");
var mkdirp = require("mkdirp");
var fs = require("fs");
var http = require("http");
var path = require("path");
var glob = require("glob");
var assert = require("assert");
var scriptPtrn = /(<script.*?src=["']((?:https?:)?\/\/[a-z0-9@\/\.\-]+\.[a-z]{2,4}(?![a-z])(?:\/[a-z\-\/\.\?=0-9\&_]*)?)["'].*?>\s?<\/script>)/g;
var CdnDlerConfig = (function (_super) {
    __extends(CdnDlerConfig, _super);
    function CdnDlerConfig() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    return CdnDlerConfig;
}(Object));
exports.CdnDlerConfig = CdnDlerConfig;
var HtmlInfo = (function () {
    function HtmlInfo(config, readFile, writeFile) {
        this.config = config;
        this.readFile = readFile;
        this.writeFile = writeFile;
    }
    return HtmlInfo;
}());
exports.HtmlInfo = HtmlInfo;
var notify = function (msg, isVerbose) {
    var a = [];
    for (var _i = 2; _i < arguments.length; _i++) {
        a[_i - 2] = arguments[_i];
    }
    return isVerbose ? console.log.apply(console, [msg].concat(a)) : null;
};
var defaultConfig = {
    js: "./js/",
    cdnMap: [[/maxcdn\.bootstrapcdn\.com\//, "./"],
        [/cdnjs\.cloudflare\.com\/ajax\/libs\//, './'],
        [/cdn\.jsdelivr\.net\/npm\//, './'],
        [/cdn\.jsdelivr\.net\//, './'],
        [/code\.jquery\.com\//, "./jquery/"],
        [/ajax\.googleapis\.com\/ajax\/libs\//, './']],
    downloadOK: true,
    overwriteOK: false,
    mkdirOK: true,
    dirdotOK: false,
    verbose: true
};
var getLocalPath = function (url, config, i) {
    if (i === void 0) { i = 0; }
    var cdnMap = config.cdnMap;
    if (i >= cdnMap.length)
        return "";
    var urlDir = cdnMap[i];
    var dirPattern = RegExp(urlDir[0]);
    if (dirPattern.test(url)) {
        var exec = dirPattern.exec(url);
        var subdir = url.substr(exec.index + exec[0].length);
        var js = (config.hasOwnProperty("js")) ? config.js : "";
        var normPath = path.normalize(js + urlDir[1] + subdir).split('/').join(path.sep);
        if (!config.dirdotOK && normPath.indexOf('.' + path.sep) >= 0)
            throw Error("Dirdot: These settings will create this path '" + normPath + "'. A directory with a .at the end is difficult to delete for Windows users. If this is what you want, change the config setting 'dirdotOK' to true");
        return normPath;
    }
    else
        return getLocalPath(url, config, i + 1);
};
var verifyHTML = function (file) { return (file && file != ''); };
var readHtmlFile = function (readFile, config) {
    notify("using config", config.verbose, config);
    notify("reading HTML file \"" + readFile + "\"", config.verbose);
    var writeFile = config.outFile == undefined ? config.outDir + path.basename(readFile) : config.outFile;
    if (writeFile == readFile && !config.overwriteOK)
        return Promise.reject(new Error("To overwrite " + readFile + ", set 'overwriteOK' in config or parameters to 'true'"));
    notify("will write to " + writeFile, config.verbose);
    var executor = function (resolve, reject) {
        var htmlInfo = new HtmlInfo(config, readFile, writeFile);
        var onRead = function (err, data) {
            if (err)
                return onError(err);
            else if (!verifyHTML(data))
                return Promise.reject(readFile + " contains invalid or no data");
            else
                return resolve(R.assoc('html', data, htmlInfo));
        };
        var onError = function (error) { return reject(error); };
        try {
            fs.readFile(readFile, 'utf8', onRead);
        }
        catch (error) {
            onError(error);
        }
    };
    return new Promise(executor);
};
var identifyScripts = function (info) {
    notify("identifying scripts in \"" + info.readFile + "\"", info.config.verbose);
    var getSrcs = function (html, matches) {
        if (matches === void 0) { matches = []; }
        var match = RegExp(scriptPtrn).exec(html);
        if (match == null)
            return matches;
        var src = match[0];
        var isHit = function (src, pattern) { return RegExp(pattern).test(src); };
        var hasMatch = R.any(R.curry(isHit)(src))(info.config.cdnMap.map(function (c) { return c[0]; }));
        notify("    adding script " + src, info.config.verbose);
        return hasMatch ? getSrcs(html, R.append(match, matches)) : getSrcs(html, matches);
    };
    var matches = getSrcs(info.html);
    if (matches.length == 0)
        notify("    no scripts identified in " + info.readFile, info.config.verbose);
    var urls = matches.map(function (m) { return m[2]; });
    var newInfo = R.compose(R.assoc('urls', urls), R.assoc('matches', matches))(info);
    return newInfo;
};
var downloadSrcs = function (info) {
    var dlSrcHlpr = function (url) { return new Promise(function (resolve, reject) {
        var src = url.startsWith("//") ? "http:" + url : url.startsWith("https:") ? url.replace("https:", "http:") : url;
        var onResponseEnd = function (url, fileData) { return resolve([url, fileData]); };
        var onResponseError = function (e) { return reject(e); };
        var onResponseGet = function (res) {
            var statusCode = res.statusCode;
            if (statusCode != 200)
                reject("Error " + statusCode + ": " + res.statusMessage + " " + url);
            var fileData = '';
            res.on('data', function (data) {
                fileData += data;
            }).on('end', function () {
                notify("  done \"" + path.basename(src) + "\"", info.config.verbose);
                onResponseEnd(url, fileData);
            }).on('error', onResponseError);
        };
        try {
            notify("  downloading \"" + src + "\"", info.config.verbose);
            var getRequest = http.get(src, onResponseGet);
            getRequest.on('error', function (err) { return onResponseError(err); });
        }
        catch (error) {
            notify("  error \"" + src + "\"", info.config.verbose, error);
            onResponseError(error);
        }
    }); };
    if (info.config.downloadOK) {
        notify("downloading identified src scripts in \"" + info.readFile + "\"", info.config.verbose);
        var downloads = R.map(dlSrcHlpr)(info.urls);
        var addDownloads = function (d) { return new Promise(function (resolve, reject) {
            try {
                var urls = d.map(function (u) { return u[0]; });
                var data = d.map(function (u) { return u[1]; });
                var paths = urls.map(function (url) { return getLocalPath(url, info.config); });
                var newInfo = R.compose(R.assoc('urls', urls), R.assoc('data', data), R.assoc('paths', paths))(info);
                resolve(newInfo);
            }
            catch (e) {
                reject(e);
            }
        }); };
        return Promise.all(downloads).then(addDownloads);
    }
    else
        return Promise.resolve(info);
};
var makeDirs = function (info) {
    if (info.config.mkdirOK) {
        notify("making directories for scripts: \"" + info.urls.map(function (u) { return path.basename(u); }).join(', ') + "\"", info.config.verbose, info);
        var dirsToMake = info.paths.map(path.dirname);
        var writeDir = function (dir) {
            notify("    mkDir " + dir, info.config.verbose);
            mkdirp.sync(dir);
        };
        dirsToMake.forEach(writeDir);
        if (dirsToMake.length == 0)
            notify("    mkdir unnecessary", info.config.verbose);
    }
    return info;
};
var writeFile = function (path, data, isNotify) {
    notify("    writing " + path, isNotify);
    try {
        var file = fs.createWriteStream(path);
        file.write(data);
        file.end();
        notify("    done " + path, isNotify);
    }
    catch (error) {
        notify("    write error " + path, isNotify, error);
    }
};
var writeSrcs = function (info) {
    notify('writing srcs', info.config.verbose);
    R.zip(info.paths, info.data).forEach(function (d) { return writeFile(d[0], d[1], info.config.verbose); });
    return info;
};
var modifyHtmlFile = function (info) {
    if (info.config.overwriteOK) {
        notify("modifying html of " + info.readFile, info.config.verbose);
        var replaceSrcs_1 = function (html, info, index) {
            if (index === void 0) { index = 0; }
            if (index >= info.matches.length)
                return html;
            var modHtml = replaceSrcs_1(html, info, index + 1);
            var exec = info.matches[index];
            var localSrcPath = info.paths[index];
            var localHtmlDir = path.dirname(info.writeFile);
            var relPath = path.relative(localHtmlDir, localSrcPath).split(path.sep).join('/');
            notify("relative path is " + relPath + " from '" + localHtmlDir + "' to '" + localSrcPath + "'", info.config.verbose);
            var replaceStr = "<script src=\"" + relPath + "\"></script>";
            var newHtml = modHtml.substring(0, exec.index) + replaceStr + modHtml.substr(exec.index + exec[0].length);
            return newHtml;
        };
        var modifiedHtml = replaceSrcs_1(info.html, info);
        if (modifiedHtml === info.html)
            notify("    html is unmodified", info.config.verbose);
        if (!modifiedHtml || modifiedHtml == '')
            throw Error("HTML was modified into empty string! It's likely that there is a bad regular expression in config.cdnMap Debug info:\n " + JSON.stringify(info));
        return R.assoc('modifiedHtml', modifiedHtml, info);
    }
    else
        return info;
};
var writeHtmlFile = function (info) {
    if (info.config.overwriteOK && info.modifiedHtml != info.html) {
        notify("writing modified HTML " + info.modifiedHtml, info.config.verbose);
        if (info.modifiedHtml && info.modifiedHtml != '')
            writeFile(info.writeFile, info.modifiedHtml, info.config.verbose);
        else
            throw Error("Attempt to write empty string to " + info.writeFile);
    }
    return info;
};
var verifyConfig = function (config) {
    notify("verifyConfig", config.verbose, config);
    var hasInput = R.has('input', config);
    assert.ok(hasInput, "Config: \"input\" must be defined either in the config file or as a command-line parameter.");
    var hasOutDir = R.has('outDir', config);
    var hasOutFile = R.has('outFile', config);
    assert.ok(hasOutFile || hasOutDir, "Config: 'outFile' or 'outDir' must be defined.");
    var isInputArray = Array.isArray(config.input);
    assert.ok((isInputArray && hasOutDir) || !isInputArray, "Config: If 'input' is an array, 'outDir' must be defined.");
    return config;
};
var mergeConfig = function (config) { return config == undefined ? defaultConfig : R.merge(defaultConfig, config); };
var normalizeConfig = R.pipe(verifyConfig, mergeConfig);
exports.processFile = function (file, config) {
    return readHtmlFile(file, normalizeConfig(config))
        .then(identifyScripts)
        .then(downloadSrcs)
        .then(makeDirs)
        .then(writeSrcs)
        .then(modifyHtmlFile)
        .then(writeHtmlFile)
        .then(function (info) { return info; });
};
var getFilesInDir = function (dir) { return new Promise(function (resolve, reject) {
    var options = {
        nodir: true
    };
    glob(dir, options, function (err, matches) {
        if (err)
            reject(err);
        resolve(matches);
    });
}); };
var getInputFiles = function (config) {
    var dirs = Array.isArray(config.input) ? config.input : [config.input];
    var promises = R.map(getFilesInDir)(dirs);
    return Promise.all(promises).then(function (a) { return R.flatten(a); });
};
var process = function (config) {
    getInputFiles(config).then(function (files) {
        var flipPF = function (config, file) { return exports.processFile(file, config); };
        var promises = R.map(R.curry(flipPF)(config))(files);
        return Promise.all(promises);
    });
};
var configure = function (config) {
    if (config === undefined) {
        return Promise.reject('try: cndler --help');
    }
    console.log("config:", config);
    if (config['help']) {
        var helpMessage = "\n -- help         This help message.\n -- config       (optional) Specify a config file in JSON format, an \n                    object with properties containing the following \n                    values:\n -- input        (required) The filename or directory of html files to use \n                    as input.  Can be used multiple times in a single \n                    command.\n                     e.g:  -- input index.html\n                     e.g:  -- input ./*.html\n                     e.g:  -- input index.html --input about.html\n -- outDir       The output directory for modified html files. One of \n                    either --outDir or --outFile is required.\n -- outFile      Alternatively, rather than outDir, can specify a single \n                    output file. In this case, --input must specify a \n                    single file only.\n -- js           The directory into which CDN javscript assets are to be \n                    downloaded and stored. \n -- mkdirOK      By default, Cndler will make any directories needed. \n                    If it is not okay for Cndler to make directories, set \n                    this to false. Cndler will throw an error if 'false' \n                    and the directory does not exist.\n -- downloadOK   By default, Cndler will download CDN assets referenced \n                    in the input html file(s), overwriting local copies. \n                    If it is not okay to download files from the CDNs and \n                    overwrite corresponding local files, set this to false.\n -- overwriteOK  By default, Cndler will *not* overwrite input html files \n                    with modifications, but will rather write them to an \n                    output directory. If the input file is the same as the \n                    output file, this must be set to true. \n                    Default is false.\n -- verbose      Setting this to true will spam output, \n                    including the *content* of downloaded files. \n                    Default is false.\n -- cdnMap       This maps a URL to a local directory, the local reference \n                    that will be used in modified html files. \n                    Can be used multiple times in a single command.  \n                    It is comprised of two quoted strings \n                    separated by a comma.  The first string is part \n                    of a URL. Everything to the left of the first string \n                    in the URL will be replaced by the second string, \n                    which represents a local directory underneath \n                    the asset root directory.\n                     e.g. The parameters \n                        --js ./js/vendor \n                        --cdnMap \"cdn.example.com\",\"./example\" \n                     will map the URL \n                     https://cdn.example.com/js-fwork/1.0/example.js \n                     to the local path \n                     'js/vendor/example/js-fwork/1.0/example.js', \n                     and the src attribute will be changed \n                     in the modified html.";
        return Promise.reject(helpMessage);
    }
    var readConfigFile = function (resolve, reject) {
        var onRead = function (err, data) {
            var firstCharCode = data.charCodeAt(0);
            var parseData = (firstCharCode == 65279) ? data.substr(1) : data;
            var newConfig = JSON.parse(parseData);
            if (err)
                return onError(err);
            else
                return resolve(newConfig);
        };
        var onError = function (error) { return reject(error); };
        var filePath = config['config'];
        console.log("config:", config);
        try {
            fs.readFile(filePath, 'utf8', onRead);
        }
        catch (error) {
            onError(error);
        }
    };
    var configHasConfig = config != undefined && config.hasOwnProperty('config');
    return configHasConfig ? new Promise(readConfigFile) : Promise.resolve(config);
};
exports.run = function (config) { return configure(config).then(process); };
require('make-runnable/custom')({
    printOutputFrame: false
});
//# sourceMappingURL=index.js.map