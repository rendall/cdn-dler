
const R = require('ramda');
const fs = require('fs');
const http = require('http');
const urlParser = require('url');


//TODO: take this out, put it in a config file.
var DOWNLOAD_DIR = './js/';

const openHtmlFile = (file: string) => new Promise((resolve: any, reject: any) => {
    const onResponse = (err: Error, data: string) => err ? onError(err) : onSuccess(data);
    const onError = (error: any) => reject(error);
    const onSuccess = (data: string) => resolve(data);

    try {
        fs.readFile(file, 'utf8', onResponse);
    } catch (error) {
        onError(error);
    }
});

const scriptPtrn = /(<script.*?src=["']((?:https?:)?\/\/[a-z0-9\/\.\-]+\.[a-z]{2,4}(?![a-z])(?:\/[a-z\-\/\.\?=0-9\&_]*)?)["'].*>)/g

const getTag = (html: string) => {
    const pattern = RegExp(scriptPtrn);
    const exec = pattern.exec(html);
    return (exec != null) ? exec[1] : null;
}

const getAllSrcs = (html: string, idx: number = 0, matches: RegExpExecArray[] = []): RegExpExecArray[] => {
    const match = RegExp(scriptPtrn).exec(html);
    if (match == null) return matches;
    return getAllSrcs(html, match.index, R.append(match, matches));
}


const downloadFile = (exec: RegExpExecArray) => new Promise((resolve: any, reject: any) => {
    const url = exec[2];
    const src = url.startsWith("//") ? "http:" + url : url.startsWith("https:") ? url.replace("https:", "http:") : url;

    var file_name = urlParser.parse(src).pathname.split('/').pop();
    var file = fs.createWriteStream(DOWNLOAD_DIR + file_name);

    try {
        http.get(src, (res: any) => {
            res.on('data', function (data: string) {
                file.write(data);
            }).on('end', function () {
                file.end();
                console.log(file_name + ' downloaded to ' + DOWNLOAD_DIR);
                resolve(exec);
            });
        })
    } catch (error) {
        reject(error);
    }
});

const downloadFiles = (matches: RegExpExecArray[]) => {
    const promises = matches.map(downloadFile);
    Promise.all(promises).then((x) => console.log("all promise:", x)).catch((e) => console.log("all error:", e));

    setTimeout(function () {
        promises.forEach((p) => console.log(p));
    }, 1000);

    return matches;
}

const parseFile = (file: string) => openHtmlFile(file)
    .then(getAllSrcs)
    .then(downloadFiles)
    //.then((html: string) => getTag(html))
    .catch((e: any) => console.error(e));

exports.openHtmlFile = openHtmlFile;
exports.getTag = getTag;
exports.parseFile = parseFile;
exports.getAllSrcs = getAllSrcs;
require('make-runnable');
