// 性能监控系统
export interface PerformanceMetrics {
    matchCount: number;
    totalMatchTime: number;
    averageMatchTime: number;
    bestMatchTime: number;
    worstMatchTime: number;
    frameCount: number;
    cacheHits: number;
    cacheMisses: number;
    roiMatches: number;
    fullScreenMatches: number;
    adaptiveScalingAttempts: number;
    adaptiveScalingSuccesses: number;
}

export interface MatchRecord {
    timestamp: number;
    duration: number;
    score: number;
    scale: number;
    usedROI: boolean;
    templateWidth: number;
    templateHeight: number;
    adaptiveScaling: boolean;
}

export class PerformanceMonitor {
    private metrics: PerformanceMetrics = {
        matchCount: 0,
        totalMatchTime: 0,
        averageMatchTime: 0,
        bestMatchTime: Infinity,
        worstMatchTime: 0,
        frameCount: 0,
        cacheHits: 0,
        cacheMisses: 0,
        roiMatches: 0,
        fullScreenMatches: 0,
        adaptiveScalingAttempts: 0,
        adaptiveScalingSuccesses: 0
    };

    private recentMatches: MatchRecord[] = [];
    private maxRecentRecords = 100;
    private enabled = true;

    constructor(enabled = true) {
        this.enabled = enabled;
    }

    // 开始性能测量
    startMatch(): { end: (result: any) => void } {
        if (!this.enabled) {
            return { end: () => {} };
        }

        const startTime = performance.now();

        return {
            end: (result: any) => {
                const duration = performance.now() - startTime;
                this.recordMatch(duration, result);
            }
        };
    }

    /**
     * 记录匹配结果
     * @param duration 匹配耗时 (ms)
     * @param result 匹配结果对象
     */
    recordMatch(duration: number, result: any) {
        this.metrics.matchCount++;
        this.metrics.totalMatchTime += duration;
        this.metrics.averageMatchTime = this.metrics.totalMatchTime / this.metrics.matchCount;
        this.metrics.bestMatchTime = Math.min(this.metrics.bestMatchTime, duration);
        this.metrics.worstMatchTime = Math.max(this.metrics.worstMatchTime, duration);

        const record: MatchRecord = {
            timestamp: Date.now(),
            duration,
            score: result?.score || 0,
            scale: result?.bestScale || 1.0,
            usedROI: result?.usedROI || false,
            templateWidth: result?.templateWidth || 0,
            templateHeight: result?.templateHeight || 0,
            adaptiveScaling: result?.adaptiveScaling || false
        };

        this.recentMatches.push(record);
        if (this.recentMatches.length > this.maxRecentRecords) {
            this.recentMatches.shift();
        }

        // 更新其他指标
        if (result?.usedROI) {
            this.metrics.roiMatches++;
        } else {
            this.metrics.fullScreenMatches++;
        }

        if (result?.adaptiveScaling) {
            this.metrics.adaptiveScalingAttempts++;
            if (result?.score > 0.8) {
                this.metrics.adaptiveScalingSuccesses++;
            }
        }
    }

    // 记录缓存命中
    recordCacheHit() {
        if (this.enabled) {
            this.metrics.cacheHits++;
        }
    }

    // 记录缓存未命中
    recordCacheMiss() {
        if (this.enabled) {
            this.metrics.cacheMisses++;
        }
    }

    // 记录帧捕获
    recordFrame() {
        if (this.enabled) {
            this.metrics.frameCount++;
        }
    }

    // 获取当前性能指标
    getMetrics(): PerformanceMetrics {
        return { ...this.metrics };
    }

    // 获取最近的匹配记录
    getRecentMatches(limit = 10): MatchRecord[] {
        return this.recentMatches.slice(-limit);
    }

    // 获取性能统计
    getPerformanceStats() {
        const recentMatches = this.getRecentMatches(20);
        const recentAvg = recentMatches.length > 0
            ? recentMatches.reduce((sum, m) => sum + m.duration, 0) / recentMatches.length
            : 0;

        const cacheHitRate = (this.metrics.cacheHits + this.metrics.cacheMisses) > 0
            ? (this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)) * 100
            : 0;

        const adaptiveScalingSuccessRate = this.metrics.adaptiveScalingAttempts > 0
            ? (this.metrics.adaptiveScalingSuccesses / this.metrics.adaptiveScalingAttempts) * 100
            : 0;

        return {
            overall: {
                ...this.metrics,
                cacheHitRate: Math.round(cacheHitRate * 100) / 100,
                adaptiveScalingSuccessRate: Math.round(adaptiveScalingSuccessRate * 100) / 100
            },
            recent: {
                averageTime: Math.round(recentAvg * 100) / 100,
                count: recentMatches.length
            },
            recommendations: this.generateRecommendations()
        };
    }

    // 生成性能优化建议
    private generateRecommendations(): string[] {
        const recommendations: string[] = [];

        if (this.metrics.averageMatchTime > 500) {
            recommendations.push('平均匹配时间较长，建议启用ROI或提高降采样率');
        }

        if (this.metrics.worstMatchTime > 1000) {
            recommendations.push('存在匹配时间过长的情况，建议检查模板复杂度');
        }

        const cacheHitRate = (this.metrics.cacheHits + this.metrics.cacheMisses) > 0
            ? (this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses))
            : 0;

        if (cacheHitRate < 0.3) {
            recommendations.push('缓存命中率较低，建议增加缓存大小或优化模板选择');
        }

        if (this.metrics.fullScreenMatches > this.metrics.roiMatches * 2) {
            recommendations.push('全屏匹配较多，建议配置ROI区域以提高性能');
        }

        const adaptiveScalingSuccessRate = this.metrics.adaptiveScalingAttempts > 0
            ? (this.metrics.adaptiveScalingSuccesses / this.metrics.adaptiveScalingAttempts)
            : 0;

        if (adaptiveScalingSuccessRate < 0.5 && this.metrics.adaptiveScalingAttempts > 10) {
            recommendations.push('自适应缩放成功率较低，建议调整尺度范围');
        }

        return recommendations;
    }

    // 重置指标
    reset() {
        this.metrics = {
            matchCount: 0,
            totalMatchTime: 0,
            averageMatchTime: 0,
            bestMatchTime: Infinity,
            worstMatchTime: 0,
            frameCount: 0,
            cacheHits: 0,
            cacheMisses: 0,
            roiMatches: 0,
            fullScreenMatches: 0,
            adaptiveScalingAttempts: 0,
            adaptiveScalingSuccesses: 0
        };
        this.recentMatches = [];
    }

    // 启用/禁用监控
    setEnabled(enabled: boolean) {
        this.enabled = enabled;
    }

    // 导出性能数据
    exportData() {
        return {
            timestamp: Date.now(),
            metrics: this.metrics,
            recentMatches: this.recentMatches
        };
    }
}

// 导出单例
export const performanceMonitor = new PerformanceMonitor();