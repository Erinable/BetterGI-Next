// BetterGI Debug Helper - 用于浏览器控制台的调试工具
// 在控制台中运行这个函数来检查 BetterGi 状态

(function checkBetterGi() {
    console.log('🔍 BetterGI 状态检查开始...\n');

    // 检查主要的全局对象
    const globalNames = ['BetterGi', '_BetterGiDebug', 'BETTERGI'];
    const results = {};

    for (const name of globalNames) {
        results[name] = !!window[name];
        console.log(`${name}: ${results[name] ? '✅' : '❌'}`);
    }

    // 如果找到 BetterGi，显示详细信息
    if (window.BetterGi) {
        console.log('\n📋 BetterGi 详细信息:');
        console.log('Engine:', !!window.BetterGi.engine);

        if (window.BetterGi.engine) {
            const engine = window.BetterGi.engine;
            console.log('Input System:', !!engine.input);
            console.log('Vision System:', !!engine.vision);
            console.log('Algorithm System:', !!engine.algo);
            console.log('Current Config:', !!engine.config);
            console.log('Active Task:', !!engine.activeTask);

            // 检查 input 系统
            if (engine.input) {
                console.log('\n🎮 Input System 状态:');
                console.log('Channel:', !!engine.input.channel);
                console.log('Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(engine.input)));
            }

            // 检查 vision 系统
            if (engine.vision) {
                console.log('\n👁️ Vision System 状态:');
                console.log('Worker:', !!engine.vision.worker);
                console.log('Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(engine.vision)));
            }
        }
    } else {
        console.log('\n❌ BetterGi 未找到，可能的原因:');
        console.log('1. 脚本还未完全加载');
        console.log('2. 页面不是 xCloud 游戏页面');
        console.log('3. Tampermonkey 未正确注入脚本');
        console.log('4. 有其他脚本冲突');

        console.log('\n🔄 等待 5 秒后重新检查...');
        setTimeout(checkBetterGi, 5000);
        return;
    }

    // 提供快速测试函数
    console.log('\n🧪 快速测试函数:');
    console.log('// 测试输入系统');
    console.log('window.BetterGi?.engine?.input?.tap("A")');
    console.log('// 查看配置');
    console.log('window.BetterGi?.engine?.config');
    console.log('// 查看性能指标');
    console.log('window.BetterGi?.engine?.vision?.getPerformanceMetrics()');

    console.log('\n✅ 状态检查完成!');

    // 创建全局辅助函数
    window.BetterGiHelper = {
        testInput: function(key = 'A', duration = 100) {
            if (window.BetterGi?.engine?.input?.tap) {
                console.log(`🎮 测试按键: ${key} (${duration}ms)`);
                return window.BetterGi.engine.input.tap(key, duration);
            } else {
                console.error('❌ Input System 不可用');
            }
        },

        getConfig: function() {
            return window.BetterGi?.engine?.config;
        },

        getStats: function() {
            return window.BetterGi?.engine?.vision?.getPerformanceMetrics();
        },

        getInfo: function() {
            return {
                bettergi: !!window.BetterGi,
                engine: !!window.BetterGi?.engine,
                input: !!window.BetterGi?.engine?.input,
                vision: !!window.BetterGi?.engine?.vision,
                inputChannel: !!window.BetterGi?.engine?.input?.channel
            };
        }
    };

    console.log('\n🔧 BetterGiHelper 已创建，可用方法:');
    console.log('- BetterGiHelper.testInput("A", 100)');
    console.log('- BetterGiHelper.getConfig()');
    console.log('- BetterGiHelper.getStats()');
    console.log('- BetterGiHelper.getInfo()');
})();