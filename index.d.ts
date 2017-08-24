export declare class CdnDlerConfig extends Object {
    js?: string;
    cdnMap: [RegExp, string][];
    dirdotOK: boolean;
    mkdirOK: boolean;
    downloadOK: boolean;
    overwriteOK: boolean;
    verbose: boolean;
    input?: string | string[];
    outDir?: string;
    outFile?: string;
}
export declare class HtmlInfo {
    readFile: string;
    writeFile: string;
    html: string;
    modifiedHtml: string;
    matches: RegExpExecArray[];
    config: CdnDlerConfig;
    urls: string[];
    paths: string[];
    data: string[];
    constructor(config: CdnDlerConfig, readFile: string, writeFile: string);
}
export declare const processFile: (file: string, config: any) => Promise<HtmlInfo>;
export declare const run: (config?: any) => Promise<void>;
