
import R = require('ramda');
import mkdirp = require('mkdirp');
import fs = require('fs');
import http = require('http');
import path = require('path');
import glob = require("glob");
import assert = require('assert');
const scriptPtrn = /(<script.*?src=["']((?:https?:)?\/\/[a-z0-9@\/\.\-]+\.[a-z]{2,4}(?![a-z])(?:\/[a-z\-\/\.\?=0-9\&_]*)?)["'].*?>\s?<\/script>)/g

export class CdnDlerConfig extends Object {
    js?: string; // The root directory to write downloaded js files to.
    cdnMap: [RegExp, string][]; // How to convert URLs to local directory structure.
    dirdotOK: boolean;
    mkdirOK: boolean; // If it's okay to make directories, set this to true.
    downloadOK: boolean; // If it's okay to download files from the CDN and overwrite corresponding local files, set this to true.
    overwriteOK: boolean; // if it's okay to overwrite HTML files, set this to true.
    verbose: boolean;
    input?: string | string[];
    outDir?: string;
    outFile?: string;
}

export class HtmlInfo {
    readFile: string;
    writeFile: string;
    html: string;
    modifiedHtml: string;
    matches: RegExpExecArray[];
    config: CdnDlerConfig;
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

const notify = (msg: string, isVerbose: boolean, ...a: any[]) => isVerbose ? console.log(msg, ...a) : null;

const defaultConfig: CdnDlerConfig = {
    // js is an optional variable that tells the module where to place all js files. Any other instruction is relative to this file.
    // if js is not defined, then instructions will be defined relative to the current working directory.
    js: "./js/",
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
    cdnMap: [[/maxcdn\.bootstrapcdn\.com\//, "./"],
    [/cdnjs\.cloudflare\.com\/ajax\/libs\//, './'],
    [/cdn\.jsdelivr\.net\/npm\//, './'],
    [/cdn\.jsdelivr\.net\//, './'],
    [/code\.jquery\.com\//, "./jquery/"],
    [/ajax\.googleapis\.com\/ajax\/libs\//, './']],
    downloadOK: true,
    overwriteOK: false,
    mkdirOK: true,
    dirdotOK: false, // since a directory ending in a dot can be such a pain in the ass, and it can accidentally happen with this module if cdnMap is incorrect, this is a failsafe to ensure it cannot happen.  Will throw an error.  If you need that, for some reason, set this to true.
    verbose: true
}

const getLocalPath = (url: string, config: CdnDlerConfig, i: number = 0): string => {

    const cdnMap = config.cdnMap;
    if (i >= cdnMap.length) return "";
    const urlDir = cdnMap[i];
    const dirPattern = RegExp(urlDir[0]);
    if (dirPattern.test(url)) {
        const exec = dirPattern.exec(url)!;
        const subdir = url.substr(exec.index + exec[0].length);
        const js = (config.hasOwnProperty("js")) ? config.js : "";
        const normPath = path.normalize(js + urlDir[1] + subdir).split('/').join(path.sep);

        // dirdot check:
        if (!config.dirdotOK && normPath.indexOf('.' + path.sep) >= 0) throw Error(`Dirdot: These settings will create this path '${normPath}'. A directory with a .at the end is difficult to delete for Windows users. If this is what you want, change the config setting 'dirdotOK' to true`);

        return normPath;
    }
    else return getLocalPath(url, config, i + 1);
}

const verifyHTML = (file: string): boolean => <boolean>(file && file != '');

const readHtmlFile = (readFile: string, config: CdnDlerConfig): Promise<HtmlInfo> => {
    notify(`using config`, config.verbose, config);
    notify(`reading HTML file "${readFile}"`, config.verbose);

    const writeFile: string = config.outFile == undefined ? config.outDir + path.basename(readFile) : config.outFile;

    if (writeFile == readFile && !config.overwriteOK) return Promise.reject(new Error(`To overwrite ${readFile}, set 'overwriteOK' in config or parameters to 'true'`));

    notify(`will write to ${writeFile}`, config.verbose);

    const executor = (resolve: Function, reject: Function) => {
        const htmlInfo = new HtmlInfo(config, readFile, writeFile);
        const onRead = (err: Error, data: string) => {
            if (err) return onError(err);
            else if (!verifyHTML(data)) return Promise.reject(`${readFile} contains invalid or no data`);
            else return resolve(R.assoc('html', data, htmlInfo));
        }
        const onError = (error: any) => reject(error);

        try {
            fs.readFile(readFile, 'utf8', onRead);
        } catch (error) {
            onError(error);
        }
    }
    return new Promise<HtmlInfo>(executor);

}

const identifyScripts = (info: HtmlInfo): HtmlInfo => {
    notify(`identifying scripts in "${info.readFile}"`, info.config.verbose);

    const getSrcs = (html: string, matches: RegExpExecArray[] = []): RegExpExecArray[] => {
        const match = RegExp(scriptPtrn).exec(html);
        if (match == null) return matches;
        // Only add matches if they are in the cdnMap
        const src = match[0];
        const isHit = (src: string, pattern: RegExp) => RegExp(pattern).test(src);
        const hasMatch = R.any(R.curry(isHit)(src))(info.config.cdnMap.map((c) => c[0]));
        notify(`    adding script ${src}`, info.config.verbose);

        return hasMatch ? getSrcs(html, R.append(match, matches)) : getSrcs(html, matches);
    }

    const matches = getSrcs(info.html);
    if (matches.length == 0) notify(`    no scripts identified in ${info.readFile}`, info.config.verbose);
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
                notify(`  done "${path.basename(src)}"`, info.config.verbose);
                onResponseEnd(url, fileData);
            }).on('error', onResponseError);
        };

        try {
            notify(`  downloading "${src}"`, info.config.verbose);
            const getRequest = http.get(src, onResponseGet);
            getRequest.on('error', (err) => onResponseError(err));
        } catch (error) {
            notify(`  error "${src}"`, info.config.verbose, error);
            onResponseError(error);
        }
    });

    if (info.config.downloadOK) {
        notify(`downloading identified src scripts in "${info.readFile}"`, info.config.verbose);

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

// TODO: Make this into a promise.
const makeDirs = (info: HtmlInfo) => {
    if (info.config.mkdirOK) {
        notify(`making directories for scripts: "${info.urls.map((u) => path.basename(u)).join(', ')}"`, info.config.verbose, info);

        const dirsToMake = info.paths.map(path.dirname);

        const writeDir = (dir: string) => {
            notify(`    mkDir ${dir}`, info.config.verbose);
            mkdirp.sync(dir);
        };

        dirsToMake.forEach(writeDir);

        if (dirsToMake.length == 0) notify(`    mkdir unnecessary`, info.config.verbose);

    }
    return info;
}

const writeFile = (path: string, data: string, isNotify: boolean) => {
    notify(`    writing ${path}`, isNotify);
    try {
        let file = fs.createWriteStream(path);
        file.write(data);
        file.end();
        notify(`    done ${path}`, isNotify);
    } catch (error) {
        notify(`    write error ${path}`, isNotify, error);
    }

}

const writeSrcs = (info: HtmlInfo) => {
    notify('writing srcs', info.config.verbose);

    R.zip(info.paths, info.data).forEach((d: [string, string]) => writeFile(d[0], d[1], info.config.verbose));

    return info;
}

const modifyHtmlFile = (info: HtmlInfo) => {

    if (info.config.overwriteOK) {
        notify(`modifying html of ${info.readFile}`, info.config.verbose);

        const replaceSrcs = (html: string, info: HtmlInfo, index = 0): string => {
            if (index >= info.matches.length) return html;
            const modHtml = replaceSrcs(html, info, index + 1); // modify last first.
            //console.log("modHtml", modHtml);
            const exec = info.matches[index];
            const localSrcPath = info.paths[index];
            const localHtmlDir = path.dirname(info.writeFile);
            const relPath = path.relative(localHtmlDir, localSrcPath).split(path.sep).join('/');

            notify(`relative path is ${relPath} from '${localHtmlDir}' to '${localSrcPath}'`, info.config.verbose);

            const replaceStr = `<script src="${relPath}"></script>`;
            const newHtml = modHtml.substring(0, exec.index) + replaceStr + modHtml.substr(exec.index + exec[0].length);
            return newHtml;
        }

        const modifiedHtml = replaceSrcs(info.html, info);

        if (modifiedHtml === info.html) notify("    html is unmodified", info.config.verbose);
        if (!modifiedHtml || modifiedHtml == '') throw Error(`HTML was modified into empty string! It's likely that there is a bad regular expression in config.cdnMap Debug info:\n ${JSON.stringify(info)}`);

        return R.assoc('modifiedHtml', modifiedHtml, info);

    }
    else return info;
}

const writeHtmlFile = (info: HtmlInfo) => {

    if (info.config.overwriteOK && info.modifiedHtml != info.html) {
        notify(`writing modified HTML ${info.modifiedHtml}`, info.config.verbose);

        if (info.modifiedHtml && info.modifiedHtml != '') writeFile(info.writeFile, info.modifiedHtml, info.config.verbose);
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

const verifyConfig = (config: CdnDlerConfig) => {
    notify("verifyConfig", config.verbose, config);
    const hasInput = R.has('input', config);
    assert.ok(hasInput, `Config: "input" must be defined either in the config file or as a command-line parameter.`);

    const hasOutDir = R.has('outDir', config);
    const hasOutFile = R.has('outFile', config);
    assert.ok(hasOutFile || hasOutDir, "Config: 'outFile' or 'outDir' must be defined.");

    const isInputArray = Array.isArray(config.input);
    assert.ok((isInputArray && hasOutDir) || !isInputArray, "Config: If 'input' is an array, 'outDir' must be defined.");
    
    return config;
}
const mergeConfig = (config?: any) => config == undefined ? defaultConfig : R.merge(defaultConfig, config);

const normalizeConfig = R.pipe(verifyConfig, mergeConfig);

export const processFile = (file: string, config: any) =>
    readHtmlFile(file, normalizeConfig(config))
        .then(identifyScripts)
        .then(downloadSrcs)
        .then(makeDirs)
        .then(writeSrcs)
        .then(modifyHtmlFile)
        .then(writeHtmlFile)
        .then((info: HtmlInfo) => info) // emphasis

const getFilesInDir = (dir: string) => new Promise<string[]>((resolve: Function, reject: Function) => {
    const options: glob.IOptions = {
        nodir: true
    };
    glob(dir, options, (err: Error, matches: string[]) => {
        if (err) reject(err);
        resolve(matches);
    });
});

const getInputFiles = (config: CdnDlerConfig) => {
    const dirs = Array.isArray(config.input) ? config.input : [config.input!];
    const promises = R.map(getFilesInDir)(dirs);
    return Promise.all(promises).then((a) => R.flatten(a));
}

const process = (config: CdnDlerConfig) => {
    getInputFiles(config).then((files: any[]) => {
        const flipPF = (config: CdnDlerConfig, file: string) => processFile(file, config);
        const promises = R.map(R.curry(flipPF)(config))(files);
        return Promise.all(promises);
    });
}


//const parseConfig = (config: CdnDlerConfig) => (config.inFile == undefined) ? getInput(config) : processFile(inFile, config);

const configure = (config?: any): Promise<CdnDlerConfig> => {


    if (config === undefined) {
        return Promise.reject('try: cndler --help');
    }

    console.log("config:", config);
    if (config['help']) {
        const helpMessage:string = `
 -- help         This help message.
 -- config       (optional) Specify a config file in JSON format, an 
                    object with properties containing the following 
                    values:
 -- input        (required) The filename or directory of html files to use 
                    as input.  Can be used multiple times in a single 
                    command.
                     e.g:  -- input index.html
                     e.g:  -- input ./*.html
                     e.g:  -- input index.html --input about.html
 -- outDir       The output directory for modified html files. One of 
                    either --outDir or --outFile is required.
 -- outFile      Alternatively, rather than outDir, can specify a single 
                    output file. In this case, --input must specify a 
                    single file only.
 -- js           The directory into which CDN javscript assets are to be 
                    downloaded and stored. 
 -- mkdirOK      By default, Cndler will make any directories needed. 
                    If it is not okay for Cndler to make directories, set 
                    this to false. Cndler will throw an error if 'false' 
                    and the directory does not exist.
 -- downloadOK   By default, Cndler will download CDN assets referenced 
                    in the input html file(s), overwriting local copies. 
                    If it is not okay to download files from the CDNs and 
                    overwrite corresponding local files, set this to false.
 -- overwriteOK  By default, Cndler will *not* overwrite input html files 
                    with modifications, but will rather write them to an 
                    output directory. If the input file is the same as the 
                    output file, this must be set to true. 
                    Default is false.
 -- verbose      Setting this to true will spam output, 
                    including the *content* of downloaded files. 
                    Default is false.
 -- cdnMap       This maps a URL to a local directory, the local reference 
                    that will be used in modified html files. 
                    Can be used multiple times in a single command.  
                    It is comprised of two quoted strings 
                    separated by a comma.  The first string is part 
                    of a URL. Everything to the left of the first string 
                    in the URL will be replaced by the second string, 
                    which represents a local directory underneath 
                    the asset root directory.
                     e.g. The parameters 
                        --js ./js/vendor 
                        --cdnMap "cdn.example.com","./example" 
                     will map the URL 
                     https://cdn.example.com/js-fwork/1.0/example.js 
                     to the local path 
                     'js/vendor/example/js-fwork/1.0/example.js', 
                     and the src attribute will be changed 
                     in the modified html.`;
        


        return Promise.reject(helpMessage);
    }

    const readConfigFile = (resolve: Function, reject: Function) => {
        const onRead = (err: Error, data: string) => {
            var firstCharCode = data.charCodeAt(0);
            //console.log("firstCharCode", firstCharCode);
            // weird bug, fix
            const parseData = (firstCharCode == 65279) ? data.substr(1) : data;

            const newConfig = JSON.parse(parseData);
            if (err) return onError(err);
            else return resolve(newConfig);
        }
        const onError = (error: any) => reject(error);

        const filePath: string = config['config'];

        console.log("config:", config);

        try {
            fs.readFile(filePath, 'utf8', onRead);
        } catch (error) {
            onError(error);
        }
    }

    const configHasConfig = config != undefined && config.hasOwnProperty('config');

    return configHasConfig ? new Promise<CdnDlerConfig>(readConfigFile) : Promise.resolve(config);

}

export const run = (config?: any) => configure(config).then(process);

//export const defaultProcessFile = (file: string) => processFile(file, defaultConfig);

//exports.processFile = processFile;

require('make-runnable/custom')({
    printOutputFrame: false
})
