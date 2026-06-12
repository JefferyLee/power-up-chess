// Book Owl topic chips — display labels only. The canonical allowlist
// (including the exact stored-topic keys queried against book-seek)
// lives in functions/src/library/seekTopics.ts — KEEP THE IDS IN SYNC.

export interface SeekTopicChip {
  id: string
  en: string
  cn: string
}

const t = (id: string, en: string, cn: string): SeekTopicChip => ({ id, en, cn })

export const SEEK_TOPIC_CHIPS: SeekTopicChip[] = [
  t('chess-history', 'the history of chess', '国际象棋的历史'),
  t('chess-champions', 'chess champions', '国际象棋世界冠军'),
  t('puzzles-games', 'puzzles and board games', '谜题与桌面游戏'),
  t('knights-castles', 'knights and castles', '骑士与城堡'),
  t('dragons-myths', 'dragons and myths', '龙与神话'),
  t('greek-myths', 'Greek mythology', '希腊神话'),
  t('fairy-tales', 'classic fairy tales', '经典童话'),
  t('wizards-magic', 'wizards and magic', '巫师与魔法'),
  t('pirates', 'pirates and treasure', '海盗与宝藏'),
  t('ancient-egypt', 'ancient Egypt', '古埃及'),
  t('ancient-china', 'ancient China', '古代中国'),
  t('vikings', 'the Vikings', '维京人'),
  t('explorers-maps', 'explorers and maps', '探险家与地图'),
  t('seven-wonders', 'wonders of the world', '世界奇观'),
  t('space-planets', 'space and the planets', '太空与行星'),
  t('the-moon', 'the Moon and astronauts', '月球与宇航员'),
  t('volcanoes', 'volcanoes and earthquakes', '火山与地震'),
  t('weather', 'weather and storms', '天气与风暴'),
  t('oceans', 'the ocean and deep sea', '海洋与深海'),
  t('rocks-fossils', 'rocks, gems and fossils', '岩石、宝石与化石'),
  t('dinosaurs', 'dinosaurs', '恐龙'),
  t('sharks-whales', 'sharks and whales', '鲨鱼与鲸'),
  t('insects', 'insects and spiders', '昆虫与蜘蛛'),
  t('birds', 'birds', '鸟类'),
  t('horses', 'horses', '马'),
  t('cats-dogs', 'cats and dogs', '猫和狗'),
  t('plants-gardens', 'plants and gardens', '植物与花园'),
  t('human-body', 'the human body', '人体的奥秘'),
  t('inventions', 'great inventions', '伟大的发明'),
  t('robots', 'robots', '机器人'),
  t('coding', 'computers and coding', '计算机与编程'),
  t('math-puzzles', 'fun mathematics', '有趣的数学'),
  t('optical-illusions', 'optical illusions', '视觉错觉'),
  t('magic-tricks', 'magic tricks', '魔术戏法'),
  t('bridges-buildings', 'bridges and great buildings', '桥梁与伟大建筑'),
  t('trains-planes', 'trains, planes and ships', '火车、飞机与轮船'),
  t('time-clocks', 'time and clocks', '时间与钟表'),
  t('money-trade', 'money and trade', '钱与交易'),
  t('art-painters', 'art and famous painters', '绘画与著名画家'),
  t('music', 'music and instruments', '音乐与乐器'),
  t('poetry', 'poetry for children', '儿童诗歌'),
  t('detective', 'detective stories', '侦探故事'),
  t('survival-adventure', 'survival and adventure', '荒野求生与冒险'),
  t('friendship', 'friendship stories', '友谊的故事'),
  t('brave-girls', 'brave girls and heroines', '勇敢的女孩'),
]
