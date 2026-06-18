#!/usr/bin/env node

/**
 * 完整爬取脚本 - 优化用于爬取 5000+ 评论
 * 
 * 关键改进：
 * 1. SCRAPE_MAX_ROUNDS=999 - 允许运行 5000+ 轮
 * 2. 改进的滚动策略在 1000+ 评论时更激进
 * 3. 增加等待时间以突破 Google 的虚拟滚动瓶颈
 */

const scrapeGoogleReviews = require('./scraper');

// 设置优化的环境变量
process.env.SCRAPE_MAX_ROUNDS = '999';  // 触发 5000 轮完整爬取
process.env.NODE_ENV = 'production';     // 使用无头浏览器

console.log('🚀 开始完整评论爬取...');
console.log('⚙️  环境变量:');
console.log(`   SCRAPE_MAX_ROUNDS = ${process.env.SCRAPE_MAX_ROUNDS}`);
console.log(`   NODE_ENV = ${process.env.NODE_ENV}`);
console.log('');
console.log('📝 说明：');
console.log('   • 将运行 5000+ 轮爬取');
console.log('   • 每轮间隔 1-2 秒');
console.log('   • 1000+ 评论时启用长等待策略');
console.log('   • 预计需要 1-3 小时完成');
console.log('');

async function main() {
  try {
    const startTime = Date.now();
    const reviews = await scrapeGoogleReviews();
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    console.log('');
    console.log('═'.repeat(60));
    console.log('✅ 爬取完成！');
    console.log('═'.repeat(60));
    console.log(`📊 总共爬取: ${reviews.length} 条评论`);
    console.log(`⏱️  耗时: ${Math.floor(duration / 60)} 分 ${duration % 60} 秒`);
    console.log('💾 已保存到 public/comments.json');
    console.log('═'.repeat(60));
  } catch (err) {
    console.error('❌ 爬取失败:', err);
    process.exit(1);
  }
}

main();
