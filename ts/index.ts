
import R = require('ramda');
import mkdirp = require('mkdirp');
import fs = require('fs');
import http = require('http');
import urlParser = require('url');
import path = require('path');

export class CdnDlerConfig extends Object {
    jsDir?: string; // The root directory to write downloaded js files to.
    cdnMap: [RegExp, string][]; // How to convert URLs to local directory structure.
    dirdotOK: boolean;
    mkdirOK: boolean; // If it's okay to make directories, set this to true.
    downloadOK: boolean; // If it's okay to download files from the CDN and overwrite corresponding local files, set this to true.
    overwriteOK: boolean; // if it's okay to overwrite HTML files, set this to true.
}

export class HtmlInfo {
    readFile: string;
    writeFile: string;
    html: string;
    modifiedHtml: string;
    matches: RegExpExecArray[];
    config: CdnDlerConfig;
    //downloads: [string, string][]; // [url, fileData];
    urls: string[];
    paths: string[];
    data: string[];

    constructor(config: CdnDlerConfig, readFile: string, writeFile: string) {
        this.config = config;
        this.readFile = readFile;
        this.writeFile = writeFile;
        //this.matches = [];
        //this.html = "";
        //this.urls = [];
    }

    //addDownloads = (downloads: [string, string][]) => R.assoc('downloads', downloads, this);

}

const notify = (msg: string, ...a: any[]) => { };//console.log(msg, ...a);


const defaultConfig: CdnDlerConfig = {
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
        [/ajax\.googleapis\.com\/ajax\/libs\//, './']
        //[/ajax.aspnetcdn.com\/ajax\//, './']
        //[/.*/, './']
    ],

    /*

    */

    downloadOK: true,
    overwriteOK: true,
    mkdirOK: true,
    dirdotOK: false // since a directory ending in a dot can be such a pain in the ass, and it can accidentally happen with this module if cdnMap is incorrect, this is a failsafe to ensure it cannot happen.  Will throw an error.  If you need that, for some reason, set this to true.
}

const getLocalPath = (url: string, config: CdnDlerConfig, i: number = 0): string => {

    const cdnMap = config.cdnMap;
    if (i >= cdnMap.length) return "";
    const urlDir = cdnMap[i];
    const dirPattern = RegExp(urlDir[0]);
    if (dirPattern.test(url)) {
        const exec = dirPattern.exec(url)!;
        const dir = urlDir[1];
        const subdir = url.substr(exec.index + exec[0].length);
        const jsDir = (config.hasOwnProperty("jsDir")) ? config.jsDir : "";
        const normPath = path.normalize(jsDir + urlDir[1] + subdir).split('/').join(path.sep);

        //console.log("normPath:", normPath);

        if (!config.dirdotOK && normPath.indexOf('.' + path.sep) >= 0) throw Error(`Dirdot: These settings will create this path '${normPath}'. A directory with a .at the end is difficult to delete for Windows users. If this is what you want, change the config setting 'dirdotOK' to true`);

        return normPath;
    }
    else return getLocalPath(url, config, i + 1);
}

const verifyHTML = (file: string): boolean => <boolean>(file && file != '');

// TODO: remove the optional config arg here, and have it be mandatory.
const readHtmlFile = (file: string, config: CdnDlerConfig): Promise<HtmlInfo> => {
    notify(`reading HTML file "${file}"`);


    const executor = (resolve: Function, reject: Function) => {
        const htmlInfo = new HtmlInfo(config, file, file);
        const onResponse = (err: Error, data: string) => {
            if (err) return onError(err);
            else if (!verifyHTML(data)) return Promise.reject(`${file} contains invalid or no data`);
            else return resolve(R.assoc('html', data, htmlInfo));
        }
        const onError = (error: any) => reject(error);

        try {
            fs.readFile(file, 'utf8', onResponse);
        } catch (error) {
            onError(error);
        }
    }
    return new Promise<HtmlInfo>(executor);

}

const scriptPtrn = /(<script.*?src=["']((?:https?:)?\/\/[a-z0-9\/\.\-]+\.[a-z]{2,4}(?![a-z])(?:\/[a-z\-\/\.\?=0-9\&_]*)?)["'].*?>\s?<\/script>)/g

const identifyScripts = (info: HtmlInfo): HtmlInfo => {
    notify(`identifying scripts in "${info.readFile}"`);

    const getSrcs = (html: string, idx: number = 0, matches: RegExpExecArray[] = []): RegExpExecArray[] => {
        const match = RegExp(scriptPtrn).exec(html);
        if (match == null) return matches;
        // Only add matches if they are in the cdnMap
        const src = match[0];
        const isHit = (src: string, pattern: RegExp) => RegExp(pattern).test(src);
        const hasMatch = R.any(R.curry(isHit)(src))(info.config.cdnMap.map((c) => c[0]));
        notify(`    adding script ${src}`);

        return hasMatch ? getSrcs(html, match.index, R.append(match, matches)) : getSrcs(html, match.index, matches);
    }

    const matches = getSrcs(info.html);
    if (matches.length == 0) notify(`    no scripts identified in ${info.readFile}`);
    const urls = matches.map((m: RegExpExecArray) => m[2]);
    const newInfo: any = R.compose(R.assoc('urls', urls), R.assoc('matches', matches))(info);

    return newInfo as HtmlInfo;
}

const downloadSrcs = (info: HtmlInfo): Promise<HtmlInfo> => {

    const dlSrcHlpr = (url: string) => new Promise<[string, string]>((resolve: Function, reject: Function): any => {

        const src = url.startsWith("//") ? "http:" + url : url.startsWith("https:") ? url.replace("https:", "http:") : url;
        const onResponseEnd = (url: string, fileData: string) => resolve([url, fileData]);
        const onResponseError = (e: Error | string) => reject(e);
        const onResponseGet = (res: http.IncomingMessage) => {
            // TODO: this data collection should be fp

            const statusCode = res.statusCode;

            if (statusCode != 200) reject(`Error ${statusCode}: ${res.statusMessage} ${url}`);


            let fileData = '';



            res.on('data', function (data: string) {
                fileData += data;
            }).on('end', function () {
                notify(`  done "${path.basename(src)}"`);
                onResponseEnd(url, fileData);
                }).on('error', onResponseError);
        };

        try {
            notify(`  downloading "${src}"`);
            const getRequest = http.get(src, onResponseGet);
            getRequest.on('error', (err) => onResponseError(err));
        } catch (error) {
            notify(`  error "${src}"`, error);
            onResponseError(error);
        }
    });

    if (info.config.downloadOK) {
        notify(`downloading identified src scripts in "${info.readFile}"`);

        const downloads = R.map(dlSrcHlpr)(info.urls);
        const addDownloads = (d: [string, string][]): Promise<HtmlInfo> => new Promise((resolve: Function, reject: Function) => {
 
            try {
                const urls = d.map((u) => u[0]);
                const data = d.map((u) => u[1]);
                const paths = urls.map((url) => getLocalPath(url, info.config));
                const newInfo = R.compose(R.assoc('urls', urls), R.assoc('data', data), R.assoc('paths', paths))(info);

                resolve(newInfo);
            } catch (e) {
                //console.log("addDownloads error:");
                reject(e);

            }
        });
        return Promise.all(downloads).then(addDownloads);
    }
    else return Promise.resolve(info);
}

//const dirFromPath = (path: string) => path.substring(0, path.lastIndexOf("/"));

// TODO: Make this into a promise.
const makeDirs = (info: HtmlInfo) => {
    if (info.config.mkdirOK) {
        notify(`making directories for scripts: "${info.urls.map((u) => path.basename(u)).join(', ')}"`);

        const dirsToMake = info.paths.map(path.dirname);

        const writeDir = (dir: string) => {
            notify(`    mkDir ${dir}`);
            mkdirp.sync(dir);
        };

        dirsToMake.forEach(writeDir);

        if (dirsToMake.length == 0) notify(`    mkdir unnecessary`);

    }
    return info;
}

const writeFile = (path: string, data: string) => {
    notify(`    writing ${path}`);
    try {
        let file = fs.createWriteStream(path);
        file.write(data);
        file.end();
        notify(`    done ${path}`);
    } catch (error) {
        notify(`    write error ${path}`, error);
    }

}

const writeSrcs = (info: HtmlInfo) => {
    notify('writing srcs');


    R.zip(info.paths, info.data).forEach((d: [string, string]) => writeFile(d[0], d[1]));

    return info;
}

const modifyHtmlFile = (info: HtmlInfo) => {

    if (info.config.overwriteOK) {
        notify(`modifying html of ${info.readFile}`);

        const replaceSrcs = (html: string, info: HtmlInfo, index = 0): string => {
            if (index >= info.matches.length) return html;
            const modHtml = replaceSrcs(html, info, index + 1); // modify last first.
            //console.log("modHtml", modHtml);
            const exec = info.matches[index];
            const localSrcPath = info.paths[index];
            const localHtmlDir = path.dirname(info.writeFile);
            const relPath = path.relative(localHtmlDir, localSrcPath).split(path.sep).join('/');

            // console.log(`relPath is ${relPath} from '${localHtmlDir}' to '${localSrcPath}'`);

            const replaceStr = `<script src="${relPath}"></script>`;
            const newHtml = modHtml.substring(0, exec.index) + replaceStr + modHtml.substr(exec.index + exec[0].length);
            return newHtml;
        }

        const modifiedHtml = replaceSrcs(info.html, info);

        if (modifiedHtml === info.html) notify("    html is unmodified");
        if (!modifiedHtml || modifiedHtml == '') throw Error(`HTML was modified into empty string! It's likely that there is a bad regular expression in config.cdnMap Debug info:\n ${JSON.stringify(info)}`);

        return R.assoc('modifiedHtml', modifiedHtml, info);

    }
    else return info;
}

const writeHtmlFile = (info: HtmlInfo) => {

    if (info.config.overwriteOK && info.modifiedHtml != info.html) {
        notify(`writing modified HTML ${info.modifiedHtml}`);

        if (info.modifiedHtml && info.modifiedHtml != '') writeFile(info.writeFile, info.modifiedHtml);
        else throw Error(`Attempt to write empty string to ${info.writeFile}`);
    }

    return info;
}

//const testFuncs = (f: string, ...a: any[]) => {
//    switch (f) {
//        case 'readHtmlFile': return readHtmlFile(a[0], a[1]);
//        case 'identifyScripts': return identifyScripts(a[0]);
//        case 'processFile': return processFile;
//        case 'downloadSrcs': return downloadSrcs;
//        case 'makeDirs': return makeDirs;
//        case 'writeSrcs': return writeSrcs;
//        case 'modifyHtmlFile': return modifyHtmlFile;
//        case 'writeHtmlFile': return writeHtmlFile;
//        default:
//            console.error(`unknown function '${f}'`);
//            break;
//    }
//}

export const processFile = (file: string, config: any) => readHtmlFile(file, config)
    .then(identifyScripts)
    .then(downloadSrcs)
    .then(makeDirs)
    .then(writeSrcs)
    .then(modifyHtmlFile)
    .then(writeHtmlFile)
    .then((info: HtmlInfo) => info) // emphasis
    //.catch((e: any) => { console.error(e); return 0; });

export const defaultProcessFile = (file: string) => processFile(file, defaultConfig);

//exports.processFile = processFile;

require('make-runnable');
