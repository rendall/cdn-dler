
import R = require('ramda');
import mkdirp = require('mkdirp');
//import node = require('node');
import fs = require('fs');
import http = require('http');
import urlParser = require('url');
import path = require('path');

class Config extends Object {
    jsDir?: string; // The root directory to write downloaded files to.
    cdnMap: [RegExp, string][]; // How to convert URLs to local directory structure.
    mkdirOK: boolean; // If it's okay to make directories, set this to true.
    downloadOK: boolean; // If it's okay to download files from the CDN and overwrite corresponding local files, set this to true.

    overwriteOK: boolean; // if it's okay to overwrite HTML files, set this to true.
}

class HtmlInfo {
    file: string;
    html: string;
    modifiedHtml: string;
    matches: RegExpExecArray[];
    config: Config;
    downloads: [string, string][]; // [url, fileData];
    readonly urls: string[];

    constructor(config: Config, file: string) {
        this.config = config;
        this.file = file;
        //this.matches = [];
        //this.html = "";
        //this.urls = [];
    }

    addHtml = (html: string) => R.assoc('html', html, this);
    //addDownloads = (downloads: [string, string][]) => R.assoc('downloads', downloads, this);

}


//TODO: take this out, put it in a config file.
const configObj: Config = {
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
}

const getDownloadDir = (url: string, config: Config = configObj, i: number = 0): string => {

    const cdnMap = config.cdnMap;
    if (i >= cdnMap.length) return "";
    const urlDir = cdnMap[i];
    const dirPattern = RegExp(urlDir[0]);
    if (dirPattern.test(url)) {
        const exec = dirPattern.exec(url)!;
        const dir = urlDir[1];
        const subdir = url.substr(exec.index + exec[0].length);
        const jsDir = (config.hasOwnProperty("jsDir")) ? config.jsDir : "";


        const relPath = path.normalize(jsDir + urlDir[1] + subdir).replace('/', path.sep);
        //const absPath = __dirname + path.sep + relPath;
        return relPath;
    }
    else return getDownloadDir(url, config, i + 1);
}

// TODO: remove the optional config arg here, and have it be mandatory.
const readHtmlFile = (file: string, config?: Config) => new Promise<HtmlInfo>((resolve: Function, reject: Function) => {

    const onResponse = (err: Error, data: string) => err ? onError(err) : resolve(htmlInfo.addHtml(data));
    const onError = (error: any) => reject(error);

    const htmlInfo = new HtmlInfo(configObj, file);

    try {
        fs.readFile(file, 'utf8', onResponse);
    } catch (error) {
        onError(error);
    }
});

const scriptPtrn = /(<script.*?src=["']((?:https?:)?\/\/[a-z0-9\/\.\-]+\.[a-z]{2,4}(?![a-z])(?:\/[a-z\-\/\.\?=0-9\&_]*)?)["'].*>)/g

const identifySrcs = (info: HtmlInfo): HtmlInfo => {


    const getSrcs = (html: string, idx: number = 0, matches: RegExpExecArray[] = []): RegExpExecArray[] => {
        const match = RegExp(scriptPtrn).exec(html);
        if (match == null) return matches;
        return getSrcs(html, match.index, R.append(match, matches));
    }

    const matches = getSrcs(info.html);
    const urls = matches.map((m: RegExpExecArray) => m[2]);
    //console.log("matches", matches);
    //console.log("urls", urls);


    const newInfo: any = R.compose(R.assoc('urls', urls), R.assoc('matches', matches))(info);
    //console.log("newInfo:", newInfo);


    return newInfo as HtmlInfo;
}

const downloadSrcs = (info: HtmlInfo): Promise<HtmlInfo> => {


    const dlSrcHlpr = (url: string) => new Promise<[string, string]>((resolve: any, reject: any): any => {

        const src = url.startsWith("//") ? "http:" + url : url.startsWith("https:") ? url.replace("https:", "http:") : url;
        const onResponseEnd = (url: string, fileData: string) => resolve([url, fileData]);

        try {
            http.get(src, (res: any) => {
                // TODO: this data collection should be done in a better way, but for now...
                let fileData = '';
                res.on('data', function (data: string) {
                    fileData += data;
                }).on('end', function () {
                    //                    onResponseEnd(url, fileData);
                    onResponseEnd(url, 'fileData');
                });
            })
        } catch (error) {
            reject(error);
        }
    });

    if (info.config.downloadOK) {
        const downloads = R.map(dlSrcHlpr)(info.urls);
        return Promise.all(downloads).then((downloads) => R.assoc('downloads', downloads, info));


    }
    else return Promise.resolve(info);
}

//const dirFromPath = (path: string) => path.substring(0, path.lastIndexOf("/"));

// TODO: Make this into a promise.
const makeDirs = (info: HtmlInfo) => {
    if (info.config.mkdirOK) {
        const srcs = R.map((url: string) => getDownloadDir(url, info.config))(info.downloads.map((e) => e[0]));

        //console.log("srcs", srcs);
        const dirsToMake = R.map(path.dirname)(srcs);

        //console.log("dirsToMake:", dirsToMake);

        dirsToMake.forEach((dir: string) => mkdirp(dir, function (err) {
            if (err) console.error(err)
            else console.log(`made dir ${dir}`);
        }));

    }
    return info;
}

const writeFile = (path: string, data: string) => {
    let file = fs.createWriteStream(path);
    try {
        file.write(data);
        file.end();
        //console.log(`written: ${path}`);
    } catch (error) {
        console.error(error);
    }
}

const writeSrcs = (info: HtmlInfo) => {


    info.downloads.forEach((d: [string, string]) => writeFile(getDownloadDir(d[0]), d[1]));
    //console.log("writeSrcs", info);

    return info;
}

const modifyHtmlFile = (info: HtmlInfo) => {

    if (info.config.overwriteOK) {

        const replaceSrcs = (html: string, mr: [RegExpExecArray, [string, string]][], index = 0): string => {
            if (index >= mr.length) return html;
            const modHtml = replaceSrcs(html, mr, index + 1); // modify last first.
            const tuple = mr[index];
            const exec = tuple[0];
            const download = tuple[1];
            const localDir = getDownloadDir(download[0]).split(path.sep).join('/');
            const replaceStr = `<script src="${localDir}"></script>`;
            const newHtml = modHtml.substring(0, exec.index) + replaceStr + modHtml.substr(exec.index + exec[0].length);


            return newHtml;
        }

        const matchReplace = R.zip(info.matches, info.downloads);

        const modifiedHtml = replaceSrcs(info.html, matchReplace);

        return R.assoc('modifiedHtml', modifiedHtml, info);

    }
    else return info;
}

const writeHtmlFile = (info: HtmlInfo) => {

    if (info.config.overwriteOK) writeFile(info.file, info.modifiedHtml);

    return info;


}

const main = (config: Config) => {

}

const processFile = (file: string) => readHtmlFile(file)
    .then(identifySrcs)
    .then(downloadSrcs)
    .then(makeDirs)
    .then(writeSrcs)
    .then(modifyHtmlFile)
    .then(writeHtmlFile)
    //.then((html: string) => getTag(html))
    .then((a: any) => { console.log(a); return 1; })
    .catch((e: any) => console.error(e));

exports.getDownloadDir = getDownloadDir;
exports.processFile = processFile;


require('make-runnable');
