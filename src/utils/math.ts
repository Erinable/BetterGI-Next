/**
 * 数学工具库：专门处理随机化，模拟人类操作的不确定性
 */
export class RandomUtils {
    // Box-Muller 变换：生成符合正态分布的随机数
    static normal(mean: number, stdDev: number): number {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        
        const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        // 映射到 mean 和 stdDev
        return num * stdDev + mean;
    }

    // 获取限制在 min/max 范围内的正态分布时间
    static humanDelay(mean: number, dev: number, min = 40): number {
        const val = this.normal(mean, dev);
        return Math.max(min, Math.floor(val));
    }
}
