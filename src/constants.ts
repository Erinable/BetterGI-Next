// src/constants.ts - Application constants

/**
 * OpenCV.js CDN URL
 */
export const OPENCV_CDN_URL = 'https://docs.opencv.org/4.8.0/opencv.js';

/**
 * 帧缓存配置
 */
export const FRAME_CACHE = {
    /** 缓存过期时间 (ms) */
    EXPIRY_TIME: 100,
    /** 最大缓存大小 */
    MAX_SIZE: 10
};

/**
 * 模板缓存配置
 */
export const TEMPLATE_CACHE = {
    /** 缓存过期时间 (ms) */
    EXPIRY_TIME: 300000, // 5 minutes
    /** 最大缓存大小 */
    MAX_SIZE: 50
};

/**
 * 输入系统配置
 */
export const INPUT_SYSTEM = {
    /** 最大初始化尝试次数 */
    MAX_INIT_ATTEMPTS: 10,
    /** 每次尝试间隔 (ms) */
    INIT_CHECK_INTERVAL: 1000
};

/**
 * 视觉系统配置
 */
export const VISION_SYSTEM = {
    /** 视频扫描间隔 (ms) */
    VIDEO_SCAN_INTERVAL: 1000,
    /** 缓存清理间隔 (ms) */
    CACHE_CLEAN_INTERVAL: 5000
};

/**
 * 默认匹配配置
 */
export const DEFAULT_MATCH_CONFIG = {
    /** 默认阈值 */
    THRESHOLD: 0.8,
    /** 默认降采样率 */
    DOWNSAMPLE: 0.33,
    /** 默认尺度 */
    SCALES: [1.0] as readonly number[]
};
