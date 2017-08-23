export declare class CdnDlerConfig extends Object {
    jsDir?: string;
    cdnMap: [RegExp, string][];
    dirdotOK: boolean;
    mkdirOK: boolean;
    downloadOK: boolean;
    overwriteOK: boolean;
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
export declare const defaultProcessFile: (file: string) => Promise<HtmlInfo>;
