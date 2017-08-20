"use strict";
var R = require('ramda');
var fs = require('fs');
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
var scriptPtrn = /<script.*?src=["']((?:https?:\/\/)?[a-z0-9\/\.\-]+\.[a-z]{2,4}(?![a-z])(?:\/[a-z\/\.\?=0-9\&_]*)?)["']/;
var getTag = function (html) {
    var pattern = RegExp(scriptPtrn);
    var exec = pattern.exec(html);
    return (exec != null) ? exec[1] : null;
};
var parseFile = function (file) { return openHtmlFile(file).then(function (data) { return getTag(data); }).catch(function (e) { return console.error(e); }); };
exports.openHtmlFile = openHtmlFile;
exports.getTag = getTag;
exports.parseFile = parseFile;
require('make-runnable');
