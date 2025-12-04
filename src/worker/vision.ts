/// <reference lib="webworker" />

declare const cv: any;
importScripts('https://docs.opencv.org/4.8.0/opencv.js');

self.onmessage = (e: MessageEvent) => {
    const { id, type, payload } = e.data;
    if (typeof cv === 'undefined') return;

    try {
        if (type === 'INIT') {
             // OpenCV 初始化检查
             if (cv.Mat) self.postMessage({ type: 'INIT_DONE' });
        }
        else if (type === 'MATCH') {
            const { image, template, config } = payload;
            
            // 接收主线程转移过来的 Buffer
            let src = cv.matFromImageData(image);
            let templ = cv.matFromImageData(template);

            // 1. 降采样
            if (config.downsample && config.downsample !== 1.0) {
                let dSrc = new cv.Mat(), dTempl = new cv.Mat();
                cv.resize(src, dSrc, new cv.Size(), config.downsample, config.downsample, cv.INTER_LINEAR);
                cv.resize(templ, dTempl, new cv.Size(), config.downsample, config.downsample, cv.INTER_LINEAR);
                src.delete(); templ.delete();
                src = dSrc; templ = dTempl;
            }

            // 2. 多尺度匹配
            let bestRes = { score: -1, x: 0, y: 0, scale: 1.0 };
            const scales = config.scales || [1.0];

            for (let s of scales) {
                let sTempl = new cv.Mat();
                if (s !== 1.0) cv.resize(templ, sTempl, new cv.Size(), s, s, cv.INTER_LINEAR);
                else sTempl = templ.clone();

                if (sTempl.cols <= src.cols && sTempl.rows <= src.rows) {
                    let dst = new cv.Mat(), mask = new cv.Mat();
                    cv.matchTemplate(src, sTempl, dst, cv.TM_CCOEFF_NORMED, mask);
                    let res = cv.minMaxLoc(dst, mask);
                    if (res.maxVal > bestRes.score) {
                        bestRes = { score: res.maxVal, x: res.maxLoc.x, y: res.maxLoc.y, scale: s };
                    }
                    dst.delete(); mask.delete();
                }
                sTempl.delete();
            }
            
            src.delete(); templ.delete();

            const factor = 1.0 / (config.downsample || 1.0);
            self.postMessage({
                id,
                type: 'MATCH_RESULT',
                result: { 
                    score: bestRes.score, 
                    x: bestRes.x * factor, 
                    y: bestRes.y * factor, 
                    bestScale: bestRes.scale 
                }
            });
        }
    } catch (err: any) {
        self.postMessage({ id, type: 'ERROR', error: err.message });
    }
};
