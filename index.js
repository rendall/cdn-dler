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
//import node = require('node');
var fs = require("fs");
var http = require("http");
var path = require("path");
var Config = /** @class */ (function (_super) {
    __extends(Config, _super);
    function Config() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    return Config;
}(Object));
var HtmlInfo = /** @class */ (function () {
    function HtmlInfo(config, file) {
        var _this = this;
        this.addHtml = function (html) { return R.assoc('html', html, _this); };
        this.config = config;
        this.file = file;
        //this.matches = [];
        //this.html = "";
        //this.urls = [];
    }
    return HtmlInfo;
}());
//TODO: take this out, put it in a config file.
var configObj = {
    // jsDir is an optional variable that tells the module where to place all js files. Any other instruction is relative to this file.
    // if jsDir is not defined, then instructions will be defined relative to the current working directory.
    jsDir: "./js/vendor/",
    // This cdnMap variable tells the module where to write downloaded files.
    // It uses a regexp pattern to match a given URL to a local directory.
    // It is comprised of an array of [regexp, string] tuples. e.g. ["cdn.example.com/public/", "./"]
    // The left string represents the URL. The right string represents its corresponding local directory.
    // The module will attempt to match a URL beginning from the first tuple, 
    //   using the left-hand pattern to strip characters from the URL up to, but not including, the filename. 
    //   The remaining string will be applied to the right-hand pattern to derive the intended download directory (within the jsDir, if defined). 
    // e.g.:  
    // ['*','./'] will match every single URL, strip all characters except the filename and 
    //    place the files directly under the jsDir in a flat directory structure.
    //    e.g. http://cdn.example.com/public/hello.js => ./js/hello.js 
    //
    // ["*.com/", './'] will strip all characters up to and including .com from the URL leaving the remaining path, which will be preserved under jsDir.
    //    This would match the URL http://cdn.example.com/public/hello.js to the local filepath ./js/public/hello.js 
    // ["ajax.googleapis.com/ajax/libs/", './js/vendor'] 
    //     Would convert the URL https://ajax.googleapis.com/ajax/libs/angularjs/1.6.4/angular.min.js 
    //        to the local filepath ./js/vendor/angularjs/1.6.4/angular.min.js
    // TODO: How would a user who wants js/ajax/googleapis/com/...etc go about getting that?
    cdnMap: [
        [/maxcdn\.bootstrapcdn\.com\//, "./"],
        [/code\.jquery\.com\//, "./jquery/"],
        [/ajax\.googleapis\.com\/ajax\/libs\//, './'],
        [/.*/, './']
    ],
    downloadOK: true,
    overwriteOK: true,
    mkdirOK: true
};
var getDownloadDir = function (url, config, i) {
    if (config === void 0) { config = configObj; }
    if (i === void 0) { i = 0; }
    var cdnMap = config.cdnMap;
    if (i >= cdnMap.length)
        return "";
    var urlDir = cdnMap[i];
    var dirPattern = RegExp(urlDir[0]);
    if (dirPattern.test(url)) {
        var exec = dirPattern.exec(url);
        var dir = urlDir[1];
        var subdir = url.substr(exec.index + exec[0].length);
        var jsDir = (config.hasOwnProperty("jsDir")) ? config.jsDir : "";
        var relPath = path.normalize(jsDir + urlDir[1] + subdir).replace('/', path.sep);
        //const absPath = __dirname + path.sep + relPath;
        return relPath;
    }
    else
        return getDownloadDir(url, config, i + 1);
};
// TODO: remove the optional config arg here, and have it be mandatory.
var readHtmlFile = function (file, config) { return new Promise(function (resolve, reject) {
    var onResponse = function (err, data) { return err ? onError(err) : resolve(htmlInfo.addHtml(data)); };
    var onError = function (error) { return reject(error); };
    var htmlInfo = new HtmlInfo(configObj, file);
    try {
        fs.readFile(file, 'utf8', onResponse);
    }
    catch (error) {
        onError(error);
    }
}); };
var scriptPtrn = /(<script.*?src=["']((?:https?:)?\/\/[a-z0-9\/\.\-]+\.[a-z]{2,4}(?![a-z])(?:\/[a-z\-\/\.\?=0-9\&_]*)?)["'].*>)/g;
var identifySrcs = function (info) {
    var getSrcs = function (html, idx, matches) {
        if (idx === void 0) { idx = 0; }
        if (matches === void 0) { matches = []; }
        var match = RegExp(scriptPtrn).exec(html);
        if (match == null)
            return matches;
        return getSrcs(html, match.index, R.append(match, matches));
    };
    var matches = getSrcs(info.html);
    var urls = matches.map(function (m) { return m[2]; });
    //console.log("matches", matches);
    //console.log("urls", urls);
    var newInfo = R.compose(R.assoc('urls', urls), R.assoc('matches', matches))(info);
    //console.log("newInfo:", newInfo);
    return newInfo;
};
var downloadSrcs = function (info) {
    var dlSrcHlpr = function (url) { return new Promise(function (resolve, reject) {
        var src = url.startsWith("//") ? "http:" + url : url.startsWith("https:") ? url.replace("https:", "http:") : url;
        var onResponseEnd = function (url, fileData) { return resolve([url, fileData]); };
        try {
            http.get(src, function (res) {
                // TODO: this data collection should be done in a better way, but for now...
                var fileData = '';
                res.on('data', function (data) {
                    fileData += data;
                }).on('end', function () {
                    //                    onResponseEnd(url, fileData);
                    onResponseEnd(url, 'fileData');
                });
            });
        }
        catch (error) {
            reject(error);
        }
    }); };
    if (info.config.downloadOK) {
        var downloads = R.map(dlSrcHlpr)(info.urls);
        return Promise.all(downloads).then(function (downloads) { return R.assoc('downloads', downloads, info); });
    }
    else
        return Promise.resolve(info);
};
//const dirFromPath = (path: string) => path.substring(0, path.lastIndexOf("/"));
// TODO: Make this into a promise.
var makeDirs = function (info) {
    if (info.config.mkdirOK) {
        var srcs = R.map(function (url) { return getDownloadDir(url, info.config); })(info.downloads.map(function (e) { return e[0]; }));
        //console.log("srcs", srcs);
        var dirsToMake = R.map(path.dirname)(srcs);
        //console.log("dirsToMake:", dirsToMake);
        dirsToMake.forEach(function (dir) { return mkdirp(dir, function (err) {
            if (err)
                console.error(err);
            else
                console.log("made dir " + dir);
        }); });
    }
    return info;
};
var writeFile = function (path, data) {
    var file = fs.createWriteStream(path);
    try {
        file.write(data);
        file.end();
        //console.log(`written: ${path}`);
    }
    catch (error) {
        console.error(error);
    }
};
var writeSrcs = function (info) {
    info.downloads.forEach(function (d) { return writeFile(getDownloadDir(d[0]), d[1]); });
    //console.log("writeSrcs", info);
    return info;
};
var modifyHtmlFile = function (info) {
    if (info.config.overwriteOK) {
        var replaceSrcs_1 = function (html, mr, index) {
            if (index === void 0) { index = 0; }
            if (index >= mr.length)
                return html;
            var modHtml = replaceSrcs_1(html, mr, index + 1); // modify last first.
            var tuple = mr[index];
            var exec = tuple[0];
            var download = tuple[1];
            var localDir = getDownloadDir(download[0]).split(path.sep).join('/');
            var replaceStr = "<script src=\"" + localDir + "\"></script>";
            var newHtml = modHtml.substring(0, exec.index) + replaceStr + modHtml.substr(exec.index + exec[0].length);
            return newHtml;
        };
        var matchReplace = R.zip(info.matches, info.downloads);
        var modifiedHtml = replaceSrcs_1(info.html, matchReplace);
        return R.assoc('modifiedHtml', modifiedHtml, info);
    }
    else
        return info;
};
var writeHtmlFile = function (info) {
    if (info.config.overwriteOK)
        writeFile(info.file, info.modifiedHtml);
    return info;
};
var main = function (config) {
};
var processFile = function (file) { return readHtmlFile(file)
    .then(identifySrcs)
    .then(downloadSrcs)
    .then(makeDirs)
    .then(writeSrcs)
    .then(modifyHtmlFile)
    .then(writeHtmlFile)
    .then(function (a) { console.log(a); return 1; })
    .catch(function (e) { return console.error(e); }); };
exports.getDownloadDir = getDownloadDir;
exports.processFile = processFile;
require('make-runnable');
//# sourceMappingURL=index.js.map