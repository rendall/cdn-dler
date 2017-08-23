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
var notify = function (msg) {
    var a = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        a[_i - 1] = arguments[_i];
    }
};
var defaultConfig = {
    jsDir: "./js/vendor/",
    cdnMap: [
        [/maxcdn\.bootstrapcdn\.com\//, "./"],
        [/code\.jquery\.com\//, "./jquery/"],
        [/ajax\.googleapis\.com\/ajax\/libs\//, './']
    ],
    downloadOK: true,
    overwriteOK: true,
    mkdirOK: true,
    dirdotOK: false
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
        var dir = urlDir[1];
        var subdir = url.substr(exec.index + exec[0].length);
        var jsDir = (config.hasOwnProperty("jsDir")) ? config.jsDir : "";
        var normPath = path.normalize(jsDir + urlDir[1] + subdir).split('/').join(path.sep);
        if (!config.dirdotOK && normPath.indexOf('.' + path.sep) >= 0)
            throw Error("Dirdot: These settings will create this path '" + normPath + "'. A directory with a .at the end is difficult to delete for Windows users. If this is what you want, change the config setting 'dirdotOK' to true");
        return normPath;
    }
    else
        return getLocalPath(url, config, i + 1);
};
var verifyHTML = function (file) { return (file && file != ''); };
var readHtmlFile = function (file, config) {
    notify("reading HTML file \"" + file + "\"");
    var executor = function (resolve, reject) {
        var htmlInfo = new HtmlInfo(config, file, file);
        var onResponse = function (err, data) {
            if (err)
                return onError(err);
            else if (!verifyHTML(data))
                return Promise.reject(file + " contains invalid or no data");
            else
                return resolve(R.assoc('html', data, htmlInfo));
        };
        var onError = function (error) { return reject(error); };
        try {
            fs.readFile(file, 'utf8', onResponse);
        }
        catch (error) {
            onError(error);
        }
    };
    return new Promise(executor);
};
var scriptPtrn = /(<script.*?src=["']((?:https?:)?\/\/[a-z0-9\/\.\-]+\.[a-z]{2,4}(?![a-z])(?:\/[a-z\-\/\.\?=0-9\&_]*)?)["'].*?>\s?<\/script>)/g;
var identifyScripts = function (info) {
    notify("identifying scripts in \"" + info.readFile + "\"");
    var getSrcs = function (html, idx, matches) {
        if (idx === void 0) { idx = 0; }
        if (matches === void 0) { matches = []; }
        var match = RegExp(scriptPtrn).exec(html);
        if (match == null)
            return matches;
        var src = match[0];
        var isHit = function (src, pattern) { return RegExp(pattern).test(src); };
        var hasMatch = R.any(R.curry(isHit)(src))(info.config.cdnMap.map(function (c) { return c[0]; }));
        notify("    adding script " + src);
        return hasMatch ? getSrcs(html, match.index, R.append(match, matches)) : getSrcs(html, match.index, matches);
    };
    var matches = getSrcs(info.html);
    if (matches.length == 0)
        notify("    no scripts identified in " + info.readFile);
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
                notify("  done \"" + path.basename(src) + "\"");
                onResponseEnd(url, fileData);
            }).on('error', onResponseError);
        };
        try {
            notify("  downloading \"" + src + "\"");
            var getRequest = http.get(src, onResponseGet);
            getRequest.on('error', function (err) { return onResponseError(err); });
        }
        catch (error) {
            notify("  error \"" + src + "\"", error);
            onResponseError(error);
        }
    }); };
    if (info.config.downloadOK) {
        notify("downloading identified src scripts in \"" + info.readFile + "\"");
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
        notify("making directories for scripts: \"" + info.urls.map(function (u) { return path.basename(u); }).join(', ') + "\"");
        var dirsToMake = info.paths.map(path.dirname);
        var writeDir = function (dir) {
            notify("    mkDir " + dir);
            mkdirp.sync(dir);
        };
        dirsToMake.forEach(writeDir);
        if (dirsToMake.length == 0)
            notify("    mkdir unnecessary");
    }
    return info;
};
var writeFile = function (path, data) {
    notify("    writing " + path);
    try {
        var file = fs.createWriteStream(path);
        file.write(data);
        file.end();
        notify("    done " + path);
    }
    catch (error) {
        notify("    write error " + path, error);
    }
};
var writeSrcs = function (info) {
    notify('writing srcs');
    R.zip(info.paths, info.data).forEach(function (d) { return writeFile(d[0], d[1]); });
    return info;
};
var modifyHtmlFile = function (info) {
    if (info.config.overwriteOK) {
        notify("modifying html of " + info.readFile);
        var replaceSrcs_1 = function (html, info, index) {
            if (index === void 0) { index = 0; }
            if (index >= info.matches.length)
                return html;
            var modHtml = replaceSrcs_1(html, info, index + 1);
            var exec = info.matches[index];
            var localSrcPath = info.paths[index];
            var localHtmlDir = path.dirname(info.writeFile);
            var relPath = path.relative(localHtmlDir, localSrcPath).split(path.sep).join('/');
            var replaceStr = "<script src=\"" + relPath + "\"></script>";
            var newHtml = modHtml.substring(0, exec.index) + replaceStr + modHtml.substr(exec.index + exec[0].length);
            return newHtml;
        };
        var modifiedHtml = replaceSrcs_1(info.html, info);
        if (modifiedHtml === info.html)
            notify("    html is unmodified");
        if (!modifiedHtml || modifiedHtml == '')
            throw Error("HTML was modified into empty string! It's likely that there is a bad regular expression in config.cdnMap Debug info:\n " + JSON.stringify(info));
        return R.assoc('modifiedHtml', modifiedHtml, info);
    }
    else
        return info;
};
var writeHtmlFile = function (info) {
    if (info.config.overwriteOK && info.modifiedHtml != info.html) {
        notify("writing modified HTML " + info.modifiedHtml);
        if (info.modifiedHtml && info.modifiedHtml != '')
            writeFile(info.writeFile, info.modifiedHtml);
        else
            throw Error("Attempt to write empty string to " + info.writeFile);
    }
    return info;
};
exports.processFile = function (file, config) { return readHtmlFile(file, config)
    .then(identifyScripts)
    .then(downloadSrcs)
    .then(makeDirs)
    .then(writeSrcs)
    .then(modifyHtmlFile)
    .then(writeHtmlFile)
    .then(function (info) { return info; }); };
exports.defaultProcessFile = function (file) { return exports.processFile(file, defaultConfig); };
require('make-runnable');
//# sourceMappingURL=index.js.map