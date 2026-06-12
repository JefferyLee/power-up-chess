// The Book Owl's curated topic shelf — the ONLY topics the owl will
// fetch. Child-safety: book-seek is an open LLM reading-list
// generator; the castle constrains it to this human-reviewed list
// instead of free-text input (see docs/DECISIONS.md child-safety
// rules).
//
// `storedTopic` is the EXACT `topic` field book-seek persisted when
// each list was pre-generated (its LLM normalises submitted topics,
// e.g. adding Oxford commas) — resolved once via its matchTopics
// endpoint. getReadingList matches on equality, so query with these,
// never with the original phrasing.

export interface SeekTopic {
  id: string
  /** Display labels (chips, terminal list). */
  en: string
  cn: string
  /** Exact key in book-seek's topics collection. */
  storedTopic: string
}

function t(id: string, en: string, cn: string, storedTopic: string): SeekTopic {
  return { id, en, cn, storedTopic }
}

export const SEEK_TOPICS: SeekTopic[] = [
  // Chess & games
  t('chess-history', 'the history of chess', '国际象棋的历史', "Children's books about the history of chess"),
  t('chess-champions', 'chess champions', '国际象棋世界冠军', "Children's books about legendary chess champions"),
  t('puzzles-games', 'puzzles and board games', '谜题与桌面游戏', "Children's books about puzzles and board games"),
  // Castles & legends
  t('knights-castles', 'knights and castles', '骑士与城堡', "Children's books about brave knights and medieval castles"),
  t('dragons-myths', 'dragons and myths', '龙与神话', "Children's books about dragons and mythology"),
  t('greek-myths', 'Greek mythology', '希腊神话', "Children's books about Greek mythology"),
  t('fairy-tales', 'classic fairy tales', '经典童话', "Children's books about classic fairy tales"),
  t('wizards-magic', 'wizards and magic', '巫师与魔法', "Children's books about wizards and magic"),
  t('pirates', 'pirates and treasure', '海盗与宝藏', "Children's books about pirates and hidden treasure"),
  // History & places
  t('ancient-egypt', 'ancient Egypt', '古埃及', "Children's books exploring the history and myths of ancient Egypt"),
  t('ancient-china', 'ancient China', '古代中国', "Children's books exploring the history and culture of ancient China"),
  t('vikings', 'the Vikings', '维京人', "Children's books exploring Viking history and Norse mythology"),
  t('explorers-maps', 'explorers and maps', '探险家与地图', "Children's books about explorers and maps"),
  t('seven-wonders', 'wonders of the world', '世界奇观', "Children's books exploring wonders of the world"),
  // Space & earth
  t('space-planets', 'space and the planets', '太空与行星', "Children's books about outer space and the planets"),
  t('the-moon', 'the Moon and astronauts', '月球与宇航员', "Children's books about the Moon and astronauts"),
  t('volcanoes', 'volcanoes and earthquakes', '火山与地震', "Children's books about volcanoes and earthquakes"),
  t('weather', 'weather and storms', '天气与风暴', "Children's books exploring weather phenomena and dramatic storms"),
  t('oceans', 'the ocean and deep sea', '海洋与深海', "Children's books about the ocean and deep sea"),
  t('rocks-fossils', 'rocks, gems and fossils', '岩石、宝石与化石', "Children's books about rocks, gems, and fossils"),
  // Living things
  t('dinosaurs', 'dinosaurs', '恐龙', "Children's books about dinosaurs"),
  t('sharks-whales', 'sharks and whales', '鲨鱼与鲸', "Children's books about sharks and whales"),
  t('insects', 'insects and spiders', '昆虫与蜘蛛', "Children's books about insects and spiders"),
  t('birds', 'birds', '鸟类', "Children's books about birds and avian life"),
  t('horses', 'horses', '马', "Classic and contemporary children's books about horses"),
  t('cats-dogs', 'cats and dogs', '猫和狗', "Beloved children's books featuring cats and dogs"),
  t('plants-gardens', 'plants and gardens', '植物与花园', "Children's books about plants and gardens"),
  t('human-body', 'the human body', '人体的奥秘', "Children's books exploring human anatomy and biology"),
  // Making & thinking
  t('inventions', 'great inventions', '伟大的发明', "Children's books exploring great inventions throughout human history"),
  t('robots', 'robots', '机器人', "Children's books about robots"),
  t('coding', 'computers and coding', '计算机与编程', "Children's books about computers and coding"),
  t('math-puzzles', 'fun mathematics', '有趣的数学', 'Fun and engaging mathematics books for children'),
  t('optical-illusions', 'optical illusions', '视觉错觉', "Children's books exploring optical illusions and visual tricks"),
  t('magic-tricks', 'magic tricks', '魔术戏法', "Children's books about learning and performing magic tricks"),
  t('bridges-buildings', 'bridges and great buildings', '桥梁与伟大建筑', "Children's books about bridges and great buildings"),
  t('trains-planes', 'trains, planes and ships', '火车、飞机与轮船', "Children's books about trains, planes, and ships"),
  t('time-clocks', 'time and clocks', '时间与钟表', "Children's books about time and clocks"),
  t('money-trade', 'money and trade', '钱与交易', "Children's books about money, finance, and trade"),
  // Arts & stories
  t('art-painters', 'art and famous painters', '绘画与著名画家', "Children's books introducing art and famous painters"),
  t('music', 'music and instruments', '音乐与乐器', "Children's books about music and musical instruments"),
  t('poetry', 'poetry for children', '儿童诗歌', "Children's books about poetry for children"),
  t('detective', 'detective stories', '侦探故事', 'Detective and mystery fiction for children'),
  t('survival-adventure', 'survival and adventure', '荒野求生与冒险', "Children's books about survival and wild adventure"),
  t('friendship', 'friendship stories', '友谊的故事', "Children's books about friendship stories"),
  t('brave-girls', 'brave girls and heroines', '勇敢的女孩', "Children's books featuring brave girls and heroines"),
]

export const SEEK_TOPICS_BY_ID = new Map(SEEK_TOPICS.map((s) => [s.id, s]))
