export declare class Config extends Object {
    js?: string;
    cdnMap: [RegExp, string][];
    dirdotOK: boolean;
    mkdirOK: boolean;
    downloadOK: boolean;
    overwriteOK: boolean;
    verbose: boolean;
    input?: string | string[];
    output?: string;
    outDir?: string;
    outFile?: string;
}
export declare class HtmlInfo {
    readFile: string;
    writeFile: string;
    html: string;
    modifiedHtml: string;
    matches: RegExpExecArray[];
    config: Config;
    urls: string[];
    paths: string[];
    data: string[];
    constructor(config: Config, readFile: string, writeFile: string);
}
export declare const processFile: (file: string, config: Config) => Promise<HtmlInfo>;
export declare const run: (config?: any) => Promise<void | HtmlInfo[]>;
