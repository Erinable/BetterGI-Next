declare const __WORKER_CODE__: string;

// Tampermonkey/Greasemonkey APIs (optional)
declare var GM_getValue: ((key: string, defaultValue?: any) => any) | undefined;
declare var GM_setValue: ((key: string, value: any) => void) | undefined;
declare var GM_deleteValue: ((key: string) => void) | undefined;
declare var GM_listValues: (() => string[]) | undefined;
declare var GM_openInTab: ((url: string, options?: any) => void) | undefined;
declare var GM_notification: ((options: any) => void) | undefined;
declare var GM_xmlhttpRequest: ((details: any) => void) | undefined;
declare var GM_setClipboard: ((text: string) => void) | undefined;

// [新增] 声明 unsafeWindow 用于 UserScript 沙箱访问页面全局变量
declare const unsafeWindow: Window & {
    BX_EXPOSED?: any;
    [key: string]: any;
};

declare module "*.css" {
    const content: string;
    export default content;
}
