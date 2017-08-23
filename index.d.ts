export declare class CdnDlerConfig extends Object {
    jsDir?: string;
    cdnMap: [RegExp, string][];
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
export declare const processFile: (file: string, config: any) => Promise<number | HtmlInfo>;
export declare const defaultProcessFile: (file: string) => Promise<number | HtmlInfo>;
