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

declare module "*.css" {
    const content: string;
    export default content;
}
