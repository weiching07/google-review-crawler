#!/usr/bin/env node

/**
 * 快速测试脚本 - 验证修复是否有效
 * 
 * 用法：
 *   node test-fix.js        # 运行 100 轮测试
 *   SCRAPE_MAX_ROUNDS=200 node test-fix.js  # 运行 200 轮测试
 */

const scrapeGoogleReviews = require('./scraper');

process.env.SCRAPE_TARGET_BRAND = process.env.SCRAPE_TARGET_BRAND || 'all';
process.env.SCRAPE_TARGET_STORE = process.env.SCRAPE_TARGET_STORE || 'all';
process.env.SCRAPE_MAX_ROUNDS = process.env.SCRAPE_MAX_ROUNDS || '100';
process.env.NODE_ENV = 'production';

console.log('🧪 开始测试修复...');
console.log('⚙️  环境变量:');
console.log(`   SCRAPE_MAX_ROUNDS = ${process.env.SCRAPE_MAX_ROUNDS}`);
console.log(`   SCRAPE_TARGET_BRAND = ${process.env.SCRAPE_TARGET_BRAND}`);
console.log(`   SCRAPE_TARGET_STORE = ${process.env.SCRAPE_TARGET_STORE}`);
console.log('');
console.log('🔧 修复内容：');
console.log('   ✓ 添加 500-1000 区间激进策略');
console.log('   ✓ 更频繁的长等待机制');
console.log('   ✓ 强制唤醒机制（stableCount >= 10）');
console.log('   ✓ 降低稳定性阈值 (waitThreshold)');
console.log('');

async function main() {
  try {
    const startTime = Date.now();
    const reviews = await scrapeGoogleReviews();
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    console.log('');
    console.log('═'.repeat(60));
    console.log('✅ 测试完成！');
    console.log('═'.repeat(60));
    console.log(`📊 爬取: ${reviews.length} 条评论`);
    console.log(`⏱️  耗时: ${Math.floor(duration / 60)} 分 ${duration % 60} 秒`);
    console.log('═'.repeat(60));
    
    // 检查是否突破了 900 条瓶颈
    if (reviews.length > 900) {
      console.log('✅ 成功突破 900 条瓶颈！');
    } else if (reviews.length > 500) {
      console.log(`⚠️  达到 ${reviews.length} 条，继续改进...`);
    }
  } catch (err) {
    console.error('❌ 测试失败:', err);
    process.exit(1);
  }
}

main();
