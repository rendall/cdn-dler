"use strict";
var R = require('ramda');
var fs = require('fs');
var http = require('http');
var urlParser = require('url');
//TODO: take this out, put it in a config file.
var DOWNLOAD_DIR = './js/';
var openHtmlFile = function (file) { return new Promise(function (resolve, reject) {
    var onResponse = function (err, data) { return err ? onError(err) : onSuccess(data); };
    var onError = function (error) { return reject(error); };
    var onSuccess = function (data) { return resolve(data); };
    try {
        fs.readFile(file, 'utf8', onResponse);
    }
    catch (error) {
        onError(error);
    }
}); };
var scriptPtrn = /(<script.*?src=["']((?:https?:)?\/\/[a-z0-9\/\.\-]+\.[a-z]{2,4}(?![a-z])(?:\/[a-z\-\/\.\?=0-9\&_]*)?)["'].*>)/g;
var getTag = function (html) {
    var pattern = RegExp(scriptPtrn);
    var exec = pattern.exec(html);
    return (exec != null) ? exec[1] : null;
};
var getAllSrcs = function (html, idx, matches) {
    if (idx === void 0) { idx = 0; }
    if (matches === void 0) { matches = []; }
    var match = RegExp(scriptPtrn).exec(html);
    if (match == null)
        return matches;
    return getAllSrcs(html, match.index, R.append(match, matches));
};
var downloadFile = function (exec) { return new Promise(function (resolve, reject) {
    var url = exec[2];
    var src = url.startsWith("//") ? "http:" + url : url.startsWith("https:") ? url.replace("https:", "http:") : url;
    var file_name = urlParser.parse(src).pathname.split('/').pop();
    var file = fs.createWriteStream(DOWNLOAD_DIR + file_name);
    try {
        http.get(src, function (res) {
            res.on('data', function (data) {
                file.write(data);
            }).on('end', function () {
                file.end();
                console.log(file_name + ' downloaded to ' + DOWNLOAD_DIR);
                resolve(exec);
            });
        });
    }
    catch (error) {
        reject(error);
    }
}); };
var downloadFiles = function (matches) {
    var promises = matches.map(downloadFile);
    Promise.all(promises).then(function (x) { return console.log("all promise:", x); }).catch(function (e) { return console.log("all error:", e); });
    setTimeout(function () {
        promises.forEach(function (p) { return console.log(p); });
    }, 1000);
    return matches;
};
var parseFile = function (file) { return openHtmlFile(file)
    .then(getAllSrcs)
    .then(downloadFiles)
    .catch(function (e) { return console.error(e); }); };
exports.openHtmlFile = openHtmlFile;
exports.getTag = getTag;
exports.parseFile = parseFile;
exports.getAllSrcs = getAllSrcs;
require('make-runnable');
