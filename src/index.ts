#!/usr/bin/env node
import R = require('ramda');
import mkdirp = require('mkdirp');
import fs = require('fs');
import http = require('http');
import path = require('path');
import glob = require("glob");
import assert = require('assert');
const scriptPtrn = /(<script.*?src=["']((?:https?:)?\/\/[a-z0-9@\/\.\-]+\.[a-z]{2,4}(?![a-z])(?:\/[a-z\-\/\.\?=0-9\&_]*)?)["'].*?>\s?<\/script>)/g
const helpMessage: string = `
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
 -- output      (required) The html filename or directory into which
                    cdnler will write altered html.
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
//--outDir       The output directory for modified html files.One of 
//either--outDir or --outFile is required.
// -- outFile      Alternatively, rather than outDir, can specify a single 
//output file.In this case, --input must specify a 
//single file only.


export class Config extends Object {
    js?: string; // The root directory to write downloaded js files to.
    cdnMap: [RegExp, string][]; // How to convert URLs to local directory structure.
    dirdotOK: boolean;
    mkdirOK: boolean; // If it's okay to make directories, set this to true.
    downloadOK: boolean; // If it's okay to download files from the CDN and overwrite corresponding local files, set this to true.
    overwriteOK: boolean; // if it's okay to overwrite HTML files, set this to true.
    verbose: boolean;
    input?: string | string[];
    output?: string;
    outDir?: string;
    outFile?: string;
}

const prototypeConfig: Config = { // 
    js: '',
    cdnMap: [],
    dirdotOK: false,
    mkdirOK: false,
    downloadOK: false,
    overwriteOK: false,
    verbose: false,
    input: '',
    output: '',
    outDir: '',
    outFile: ''
}

export class HtmlInfo {
    readFile: string;
    writeFile: string;
    html: string;
    modifiedHtml: string;
    matches: RegExpExecArray[];
    config: Config;
    urls: string[];
    paths: string[];
    data: string[];

    constructor(config: Config, readFile: string, writeFile: string) {
        this.config = config;
        this.readFile = readFile;
        this.writeFile = writeFile;
        //this.matches = [];
        //this.html = "";
        //this.urls = [];
    }

    //addDownloads = (downloads: [string, string][]) => R.assoc('downloads', downloads, this);

}

const isVerbose = (config: Config) => R.prop('verbose', config) == true;
const notify = (msg: string, config: Config, ...a: any[]) => isVerbose(config) ? console.log(msg, ...a) : null;
const normPath = (p: string) => path.extname(p) != '' ? p : p + (p.endsWith('/') ? '' : '/');
const normBoolean = (b: string | boolean) => (typeof b == 'string') ? b === 'false' ? false : true : b;
const defaultConfig: Config = {
    js: "./js/",
    cdnMap: [[/maxcdn\.bootstrapcdn\.com\//, "./"],
            [/cdnjs\.cloudflare\.com\/ajax\/libs\//, './'],
            [/d3js.org\//, './'],
            [/cdn\.jsdelivr\.net\/npm\//, './'],
            [/cdn\.jsdelivr\.net\//, './'],
            [/code\.jquery\.com\//, "./jquery/"],
            [/ajax\.googleapis\.com\/ajax\/libs\//, './'],
            [/unpkg\.com\//, './']],
    downloadOK: true,
    overwriteOK: false,
    mkdirOK: true,
    dirdotOK: false, // since a directory ending in a dot can be such a pain in the ass, and it can accidentally happen with this module if cdnMap is incorrect, this is a failsafe to ensure it cannot happen.  Will throw an error.  If you need that, for some reason, set this to true.
    verbose: false
}

const getLocalPath = (url: string, config: Config, i: number = 0): string => {

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

const readHtmlFile = (readFile: string, config: Config): Promise<HtmlInfo> => {
    notify(`using config`, config, config);
    notify(`reading HTML file "${readFile}"`, config);

    const writeFile: string = config.outFile == undefined ? config.outDir + path.basename(readFile) : config.outFile;

    if (writeFile == readFile && !config.overwriteOK) return Promise.reject(new Error(`To overwrite ${readFile}, set 'overwriteOK' in config or parameters to 'true'`));

    notify(`will write to ${writeFile}`, config);

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
    notify(`identifying scripts in "${info.readFile}"`, info.config);

    const getSrcs = (html: string, matches: RegExpExecArray[] = []): RegExpExecArray[] => {
        const match = RegExp(scriptPtrn).exec(html);
        if (match == null) return matches;
        // Only add matches if they are in the cdnMap
        const src = match[0];
        const isHit = (src: string, pattern: RegExp) => RegExp(pattern).test(src);
        const hasMatch = R.any(R.curry(isHit)(src))(info.config.cdnMap.map((c) => c[0]));
        notify(`    adding script ${src}`, info.config);

        return hasMatch ? getSrcs(html, R.append(match, matches)) : getSrcs(html, matches);
    }

    const matches = getSrcs(info.html);
    if (matches.length == 0) notify(`    no scripts identified in ${info.readFile}`, info.config);
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
                notify(`  done "${path.basename(src)}"`, info.config);
                onResponseEnd(url, fileData);
            }).on('error', onResponseError);
        };

        try {
            notify(`  downloading "${src}"`, info.config);
            const getRequest = http.get(src, onResponseGet);
            getRequest.on('error', (err) => onResponseError(err));
        } catch (error) {
            notify(`  error "${src}"`, info.config, error);
            onResponseError(error);
        }
    });

    if (info.config.downloadOK) {
        notify(`downloading identified src scripts in "${info.readFile}"`, info.config);

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
        notify(`making directories for scripts: "${info.urls.map((u) => path.basename(u)).join(', ')}"`, info.config);

        const dirsToMake = info.paths.map(path.dirname);

        const writeDir = (dir: string) => {
            notify(`    mkDir ${dir}`, info.config);
            mkdirp.sync(dir);
        };

        dirsToMake.forEach(writeDir);

        if (dirsToMake.length == 0) notify(`    mkdir unnecessary`, info.config);

    }
    return info;
}

const fileExists = (file: string, rejectIfNotExists: boolean = false) => new Promise(
    (resolve: Function, reject: Function) =>
        fs.exists(file, (exists: boolean) => (rejectIfNotExists && !exists) ? reject(`${file} does not exist`) : resolve(exists)));

const readFile = (file: string) => new Promise(
    (resolve: Function, reject: Function) =>
        fs.readFile(file, 'utf8', (err, data) => err == null ? resolve(data) : reject(err)));


const writeFile = (path: string, data: string, config: Config) => {
    notify(`    writing ${path}`, config);
    try {
        let file = fs.createWriteStream(path);
        file.write(data);
        file.end();
        notify(`    done ${path}`, config);
    } catch (error) {
        notify(`    write error ${path}`, config, error);
    }
}

const writeSrcs = (info: HtmlInfo) => {
    notify('writing srcs', info.config);

    R.zip(info.paths, info.data).forEach((d: [string, string]) => writeFile(d[0], d[1], info.config));

    return info;
}

const canOverwrite = (info: HtmlInfo): boolean => {
    const isFileOverwrite = info.readFile == info.writeFile;
    const isHtmlModified = info.html != info.modifiedHtml;

    return (info.config.overwriteOK || !isFileOverwrite) && isHtmlModified;
}

const modifyHtmlFile = (info: HtmlInfo) => {
    notify(`check modifying html of ${info.readFile} to ${info.writeFile}`, info.config);

    if (canOverwrite(info)) {
        notify(`modifying html of ${info.readFile}`, info.config);

        const replaceSrcs = (html: string, info: HtmlInfo, index = 0): string => {
            if (index >= info.matches.length) return html;
            const modHtml = replaceSrcs(html, info, index + 1); // modify last first.
            //console.log("modHtml", modHtml);
            const exec = info.matches[index];
            const localSrcPath = info.paths[index];
            const localHtmlDir = path.dirname(info.writeFile);
            const relPath = path.relative(localHtmlDir, localSrcPath).split(path.sep).join('/');

            notify(`relative path is ${relPath} from '${localHtmlDir}' to '${localSrcPath}'`, info.config);

            const replaceStr = `<script src="${relPath}"></script>`;
            const newHtml = modHtml.substring(0, exec.index) + replaceStr + modHtml.substr(exec.index + exec[0].length);
            return newHtml;
        }

        const modifiedHtml = replaceSrcs(info.html, info);

        if (modifiedHtml === info.html) notify("    html is unmodified", info.config);
        if (!modifiedHtml || modifiedHtml == '') throw Error(`html file would be modified into empty string! This is not allowed. It is possible that there is a bad regular expression in config.cdnMap Debug info:\n ${JSON.stringify(info)}`);

        return R.assoc('modifiedHtml', modifiedHtml, info);

    }
    else {
        notify(`not modifying html of ${info.readFile} because 'overwriteOK' is false`, info.config);

        return info;
    }
}

const writeHtmlFile = (info: HtmlInfo) => {
    notify(`check writing modified HTML to ${info.writeFile}`, info.config);

    if (canOverwrite(info)) {
        notify(`writing modified HTML ${info.writeFile}`, info.config);

        if (info.modifiedHtml && info.modifiedHtml != '') writeFile(info.writeFile, info.modifiedHtml, info.config);
        else throw Error(`Attempt to write empty string to ${info.writeFile}`);
    }
    else notify(`config settings prevent overwriting html files`, info.config);

    return info;
}


export const processFile = (file: string, config: Config) =>
    readHtmlFile(file, config)
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

const getInputFiles = (config: Config) => {
    const dirs = Array.isArray(config.input) ? config.input : [config.input!];
    const promises = R.map(getFilesInDir)(dirs);
    return Promise.all(promises).then((a) => R.flatten(a));
}

const process = (config: Config) => {
    return getInputFiles(config).then((files: any[]) => {
        const flipPF = (config: Config, file: string) => processFile(file, config);
        const promises = R.map(R.curry(flipPF)(config))(files);
        return Promise.all(promises);
    });
}


const verifyConfig = (config: Config) => {
    notify("verifyConfig", config, config);
    const hasInput = R.has('input', config);
    assert.ok(hasInput, `Config: "input" must be defined either in the config file or as a command-line parameter.`);

    const hasOutput = R.has('output', config);
    const hasOutDir = R.has('outDir', config);
    const hasOutFile = R.has('outFile', config);
    assert.ok(hasOutput || hasOutFile || hasOutDir, "Config: 'output' must be defined.");

    const isInputArray = Array.isArray(config.input) || glob.sync(config.input!).length > 1;
    if (hasOutput) {
        const output:string = R.prop('output', config);
        const outputIsDir = path.extname(output) === '';
        assert.ok((isInputArray && outputIsDir) || !isInputArray, "Config: If 'input' is more than one file, 'output' must be a directory.");
    }  
    else assert.ok((isInputArray && hasOutDir) || !isInputArray, "Config: If 'input' is more than one file, 'output' must be a directory.");

    const allowedProps = R.keys(prototypeConfig);
    const configProps = R.keys(config);
    const extraProps = R.difference(configProps, allowedProps);
    assert.ok((extraProps.length == 0), `Config: Unknown properties in config object: '${extraProps.join("', '")}'`);

    return config;
}

const mergeConfig = (config?: any): Config => R.merge(defaultConfig, config);

const normCdnMap = (cdn: any[]) => {
    console.log("Norming CdnMap");
    R.map(console.log)(cdn);
    return cdn;
}

const configTransform = {
    js: normPath,
    cdnMap: normCdnMap,
    dirdotOK: normBoolean,
    mkdirOK: normBoolean, 
    downloadOK: normBoolean, 
    overwriteOK: normBoolean, 
    verbose: normBoolean,
    outDir: normPath,
}
const evolveConfig = (config: any): Config => R.evolve(configTransform, config);
const ifHelp = (config: any) => config['help'] ? Promise.reject(helpMessage) : Promise.resolve(config);
const ifUndefinedConfig = (config: any) => (config === undefined) ? Promise.reject('Config is undefined.  Try: cndler --help') : Promise.resolve(config);
const ifExternalConfig = (config: any) => config.hasOwnProperty('config') ? readConfigFile(config) : Promise.resolve(config);

const readConfigFile = (config: any) => new Promise((resolve: Function, reject: Function) => {
    const filePath: string = config['config'];
    const oldConfig: any = R.dissoc('config', config);


    fileExists(filePath, true).then(() => readFile(filePath)).then((data: string) => {
        if (data === undefined || data === '') reject(`No or bad data in ${filePath}`);
        else {
            var firstCharCode = data.charCodeAt(0);
            // weird bug, fix
            const parseData = (firstCharCode == 65279) ? data.substr(1) : data;
            const newConfig = R.merge(JSON.parse(parseData), oldConfig); // this overwrites the external config file with properties added through the commandline
            resolve(newConfig);
        }
    }, (error: any) => reject(error));
});
const normalizeConfig = (config: any) => R.compose(mergeConfig, evolveConfig, verifyConfig)(config);

const configure = (config?: any): Promise<Config | void> =>
    ifUndefinedConfig(config)
        .then(ifHelp)
        .then(ifExternalConfig)
        .then(normalizeConfig);

const showError = (error: any) => console.error(error);

export const run = (config?: any) => configure(config).then(process, showError);

//module.exports = (config?: any) => { return run(config).then(() => { return "Complete." }); };


require('make-runnable/custom')({
    printOutputFrame: false
})
