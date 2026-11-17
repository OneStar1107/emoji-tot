/**
 * The cast: 134 named characters, each one a genome rather than a drawing.
 *
 * A member is `{ body, color, traits }` — the same three primitives a host can
 * hand-build — plus a name and a sentence, because a picker of 134 entries
 * needs something to call them by. Nothing here is a picture: add a line and
 * there is a new character, which is the point of a compositional cast over a
 * pre-drawn one.
 *
 * Order is catalogue order, grouped by family. Family ids and body ids are
 * stable; a member's id is stable forever, because a stored preference may
 * name it years later.
 */
export interface CastMember {
  id: string;
  name: { zh: string; en: string };
  desc: string;
  family: string;
  body: string;
  color: string;
  traits: string[];
  /** A face this member wears by default, when it is not the idle one. */
  face?: string;
}

export const FAMILIES: readonly { id: string; zh: string; en: string }[] = [
  { id: 'round', zh: '圆润', en: 'Round' },
  { id: 'square', zh: '方圆', en: 'Square' },
  { id: 'poly', zh: '多边', en: 'Polygon' },
  { id: 'flora', zh: '花叶', en: 'Flora' },
  { id: 'garden', zh: '田园', en: 'Garden' },
  { id: 'fruit', zh: '水果', en: 'Fruit' },
  { id: 'treat', zh: '美食', en: 'Treats' },
  { id: 'form', zh: '造型', en: 'Form' },
  { id: 'object', zh: '物件', en: 'Objects' },
  { id: 'sea', zh: '海洋', en: 'Sea' },
  { id: 'critter', zh: '小动物', en: 'Critters' },
  { id: 'people', zh: '人物', en: 'People' },
  { id: 'coal', zh: '煤球', en: 'Coal' },
];

type Row = [string, string, string, string, string, string, string[], string];

const RAW: Row[] = [
  ['tuan', '团子', 'Tuan', 'round', 'circle', 'cream', [], '什么也不做也很自在的圆，最早的一个。'],
  ['tangyuan', '汤圆', 'Tangyuan', 'round', 'circle', 'white', ['blush'], '软乎乎的，撞一下会晃三下。'],
  ['sesame', '芝麻', 'Sesame', 'round', 'circle', 'black', [], '黑得发亮，笑起来只有牙是白的。'],
  ['dousha', '豆沙', 'Bean', 'round', 'circle', 'red', ['spots'], '馅比皮多，所以总是鼓鼓的。'],
  ['nuomi', '糯米', 'Glutinous', 'round', 'circle', 'white', ['blush', 'freckles'], '有点黏人，喜欢贴着你不动。'],
  ['xueqiu', '雪球', 'Snowball', 'round', 'circle', 'white', ['fluff'], '一碰就散，但每次都自己团回来。'],
  ['xiangpi', '橡皮', 'Eraser', 'round', 'squircle', 'pink', [], '擦掉的东西它都记得，只是不说。'],
  ['mianhua', '棉花', 'Cotton', 'round', 'blob', 'white', ['fluff'], '轻得像没有重量，风一来就飘。'],
  ['zhenzhu', '珍珠', 'Pearl', 'round', 'circle', 'gray', ['starfield'], '在暗处会自己发一点点光。'],
  ['guodong', '果冻', 'Jelly', 'round', 'blob', 'cyan', [], '站着不动也在轻轻颤。'],
  ['doufu', '豆腐', 'Tofu', 'square', 'squircle', 'cream', [], '方方正正，软得刚好。'],
  ['fangtang', '方糖', 'Cube', 'square', 'squircle', 'white', ['spots'], '甜是慢慢化开的，急不得。'],
  ['binggan', '饼干', 'Biscuit', 'square', 'squircle', 'orange', ['freckles'], '边角有点焦，那是最好吃的部分。'],
  ['mianbao', '面包', 'Bread', 'square', 'pill', 'cream', ['stripes'], '刚出炉的时候最圆，凉了就扁一点。'],
  ['feizao', '肥皂', 'Soap', 'square', 'squircle', 'cyan', ['stripes'], '越用越小，但一直很香。'],
  ['kadai', '卡带', 'Cassette', 'square', 'squircle', 'violet', ['patch'], '里面还留着一首没放完的歌。'],
  ['jimu', '积木', 'Block', 'square', 'pill', 'red', [], '被推倒一百次，就搭一百零一次。'],
  ['zhuantou', '砖头', 'Brick', 'square', 'squircle', 'red', ['patch'], '沉默、结实、谁都能靠一下。'],
  ['xingxing', '星星', 'Star', 'poly', 'star', 'yellow', ['starfield'], '白天也在，只是你看不见。'],
  ['baoshi', '宝石', 'Gem', 'poly', 'gem', 'violet', ['starfield'], '切面越多，藏的光越多。'],
  ['zuanshi', '钻石', 'Diamond', 'poly', 'gem', 'cyan', [], '硬得不肯让步，亮得不肯低头。'],
  ['bingtang', '冰糖', 'Crystal', 'poly', 'gem', 'white', [], '透明的地方比有颜色的地方更甜。'],
  ['zhihe', '纸鹤', 'Crane', 'poly', 'star', 'white', [], '折痕还在，说明它飞过。'],
  ['fengchao', '蜂巢', 'Hive', 'poly', 'gem', 'orange', ['stripes'], '六边形是最省材料的形状。'],
  ['liujiao', '六角', 'Hex', 'poly', 'gem', 'blue', [], '每条边都等长，所以从不偏心。'],
  ['shuijiao', '水饺', 'Dumpling', 'poly', 'blob', 'cream', [], '肚子鼓鼓的，褶子捏得歪歪扭扭。'],
  ['huaban', '花瓣', 'Petal', 'flora', 'flower', 'pink', ['blush'], '掉下来的时候还在转圈。'],
  ['yinghua', '樱花', 'Blossom', 'flora', 'flower', 'pink', ['starfield'], '开七天，剩下的三百五十八天都在等。'],
  ['siye', '四叶', 'Clover', 'flora', 'clover', 'green', [], '第四片叶子是给别人的运气。'],
  ['pugongying', '蒲公英', 'Dandelion', 'flora', 'flower', 'yellow', ['fluff'], '一吹就散，散得到处都是希望。'],
  ['heye', '荷叶', 'Lotus', 'flora', 'flower', 'green', ['patch'], '水珠在上面滚来滚去，就是不湿。'],
  ['yunduo', '云朵', 'Cloudy', 'flora', 'cloud', 'white', [], '形状随时在变，但一直是同一朵。'],
  ['yuyun', '雨云', 'Nimbus', 'flora', 'cloud', 'gray', ['stripes'], '憋着一场雨，迟迟不下。'],
  ['mianhuatang', '棉花糖', 'Marshmallow', 'flora', 'cloud', 'white', ['blush'], '看着大，吃着没，但开心是真的。'],
  ['luzhu', '露珠', 'Dew', 'flora', 'drop', 'cyan', [], '清晨六点出现，七点就消失。'],
  ['yudi', '雨滴', 'Raindrop', 'flora', 'drop', 'blue', [], '下落的时候是最自由的。'],
  ['zhongzi', '种子', 'Seed', 'flora', 'drop', 'green', ['sprout'], '把自己埋起来，是为了长出来。'],
  ['taihua', '苔花', 'Moss', 'flora', 'clover', 'green', ['spots'], '小得没人看见，也照样开。'],
  ['yaya', '芽芽', 'Sprout', 'garden', 'pear', 'green', ['sprout'], '刚顶出土的那两天，最用力。'],
  ['mogu', '蘑菇', 'Mushroom', 'garden', 'pear', 'red', ['spots'], '雨后冒出来，晴天就躲回去。'],
  ['xiangguo', '橡果', 'Acorn', 'garden', 'pear', 'orange', ['leaf'], '戴着一顶小帽子，很得意。'],
  ['xianrenzhang', '仙人掌', 'Cactus', 'garden', 'pear', 'green', ['spike'], '刺是它唯一的社交距离。'],
  ['luobo', '萝卜', 'Radish', 'garden', 'pear', 'pink', ['leaf'], '地上那截是给人看的，甜的在下面。'],
  ['tudou', '土豆', 'Potato', 'garden', 'blob', 'cream', ['spots'], '长得随便，怎么做都好吃。'],
  ['yumi', '玉米', 'Corn', 'garden', 'pear', 'yellow', ['stripes'], '一颗一颗排得很整齐，强迫症福音。'],
  ['nangua', '南瓜', 'Pumpkin', 'garden', 'pear', 'orange', ['stripes'], '十月最忙，十一月就闲了。'],
  ['qiezi', '茄子', 'Eggplant', 'garden', 'drop', 'violet', ['leaf'], '紫得很有主见。'],
  ['juanxincai', '卷心菜', 'Cabbage', 'garden', 'circle', 'green', ['patch'], '一层一层包着，最里面最嫩。'],
  ['xiangrikui', '向日葵', 'Sunflower', 'garden', 'flower', 'yellow', ['leaf'], '一直看着太阳，脖子都酸了。'],
  ['daocao', '稻草', 'Straw', 'garden', 'pear', 'orange', ['stripes'], '干干的，但能编出很多东西。'],
  ['pingguo', '苹果', 'Apple', 'fruit', 'circle', 'red', ['leaf'], '一天一个，医生就失业了。'],
  ['lizi', '梨子', 'Pear', 'fruit', 'pear', 'green', ['leaf'], '上小下大，天生适合被捧在手心。'],
  ['caomei', '草莓', 'Strawberry', 'fruit', 'heart', 'red', ['freckles'], '籽在表面，心事也写在表面。'],
  ['yingtao', '樱桃', 'Cherry', 'fruit', 'circle', 'red', ['sprout'], '两颗一起才叫一对。'],
  ['niuyouguo', '牛油果', 'Avocado', 'fruit', 'pear', 'green', ['patch'], '要等它软，急也没用。'],
  ['xigua', '西瓜', 'Melon', 'fruit', 'circle', 'green', ['stripes'], '夏天的一半都在它肚子里。'],
  ['ningmeng', '柠檬', 'Lemon', 'fruit', 'drop', 'yellow', [], '酸得很有礼貌，先皱眉再回甘。'],
  ['lanmei', '蓝莓', 'Blueberry', 'fruit', 'circle', 'blue', ['patch'], '小小的，一抓一大把。'],
  ['putao', '葡萄', 'Grape', 'fruit', 'blob', 'violet', ['spots'], '一颗一颗摘，最后一颗最甜。'],
  ['taozi', '桃子', 'Peach', 'fruit', 'heart', 'pink', ['blush'], '毛茸茸的，洗一洗才肯让你亲。'],
  ['juzi', '橘子', 'Orange', 'fruit', 'circle', 'orange', ['freckles'], '皮比肉香，剥的时候最开心。'],
  ['mihoutao', '猕猴桃', 'Kiwi', 'fruit', 'circle', 'green', ['spots'], '外表糙，切开是另一个世界。'],
  ['buding', '布丁', 'Pudding', 'treat', 'pear', 'yellow', ['blush'], '抖一下，晃三下，这才是布丁。'],
  ['tusi', '吐司', 'Toast', 'treat', 'squircle', 'orange', ['patch'], '烤过的边最好吃，中间留给果酱。'],
  ['bingqilin', '冰淇淋', 'Icecream', 'treat', 'drop', 'cream', ['starfield'], '化得比吃得快，所以要快点。'],
  ['tiantianquan', '甜甜圈', 'Donut', 'treat', 'circle', 'pink', ['spots'], '中间那个洞，是为了让你少一点罪恶感。'],
  ['shutiao', '薯条', 'Fries', 'treat', 'pill', 'yellow', ['stripes'], '一根一根，永远吃不完最后一根。'],
  ['tangguo', '糖果', 'Candy', 'treat', 'star', 'pink', ['stripes'], '纸一剥开，世界就甜了。'],
  ['hanbao', '汉堡', 'Burger', 'treat', 'pill', 'orange', ['stripes'], '层数越多越开心，也越难咬。'],
  ['dangao', '蛋糕', 'Cake', 'treat', 'pear', 'cream', ['spots'], '蜡烛插上去那一刻才算数。'],
  ['mashu', '麻薯', 'Mochi', 'treat', 'blob', 'white', ['blush'], '拉得越长，说明越新鲜。'],
  ['danTa', '蛋挞', 'Tart', 'treat', 'circle', 'orange', ['patch'], '边要脆，心要晃。'],
  ['paofu', '泡芙', 'Puff', 'treat', 'circle', 'cream', ['fluff'], '空心是为了装下更多奶油。'],
  ['naicha', '奶茶', 'Milktea', 'treat', 'pill', 'cream', ['stripes'], '三分糖，去冰，多珍珠。'],
  ['xinbao', '心宝', 'Hearty', 'form', 'heart', 'pink', ['blush'], '跳得比说话快。'],
  ['huoyan', '火焰', 'Flame', 'form', 'drop', 'orange', ['spike'], '越烧越小，但从不熄灭。'],
  ['lingdang', '铃铛', 'Bell', 'form', 'drop', 'yellow', ['halo'], '响一下，附近的人都抬头。'],
  ['youling', '幽灵', 'Ghosty', 'form', 'ghost', 'white', ['patch'], '不是吓人，只是有点透明。'],
  ['yueliang', '月亮', 'Luna', 'form', 'drop', 'yellow', ['starfield'], '借来的光，也照亮了很多人。'],
  ['taiyang', '太阳', 'Sunny', 'form', 'circle', 'yellow', ['spike'], '每天准时上班，从不请假。'],
  ['jiqiren', '机器人', 'Beep', 'form', 'bot', 'gray', ['antenna'], '按一下会响，再按一下会停。'],
  ['caihong', '彩虹', 'Rainbow', 'form', 'cloud', 'cyan', ['starfield'], '雨停的那一刻才出现。'],
  ['qiqiu', '气球', 'Balloon', 'form', 'drop', 'red', ['bow'], '一松手就自由了，也回不来了。'],
  ['fengzheng', '风筝', 'Kite', 'form', 'gem', 'cyan', ['tail'], '飞得高，是因为有线拉着。'],
  ['mianju', '面具', 'Mask', 'form', 'heart', 'violet', ['patch'], '笑着，但不知道在想什么。'],
  ['yingzi', '影子', 'Shadow', 'form', 'blob', 'black', [], '光越强，它越清楚。'],
  ['fangzi', '房子', 'Cottage', 'object', 'squircle', 'cream', ['patch'], '灯亮着，就有人等。'],
  ['liwu', '礼物', 'Gift', 'object', 'squircle', 'red', ['bow'], '重要的不是里面，是系上去的那一下。'],
  ['dengpao', '灯泡', 'Bulb', 'object', 'drop', 'yellow', ['halo'], '亮起来的那一秒，最像自己。'],
  ['duihua', '对话', 'Chatty', 'object', 'squircle', 'blue', ['patch'], '说了一整晚，什么也没说清。'],
  ['shuben', '书', 'Book', 'object', 'pill', 'violet', ['stripes'], '翻开之前，它什么也不是。'],
  ['xiangji', '相机', 'Camera', 'object', 'squircle', 'gray', ['spots'], '把现在变成以后。'],
  ['shizhong', '时钟', 'Clock', 'object', 'circle', 'cream', ['freckles'], '一直在走，从没到过。'],
  ['youpiao', '邮票', 'Stamp', 'object', 'squircle', 'cyan', ['patch'], '去过很多地方，自己被撕掉。'],
  ['lazhu', '蜡烛', 'Candle', 'object', 'pill', 'cream', ['horn'], '照亮别人，烧掉自己。'],
  ['yaoshi', '钥匙', 'Key', 'object', 'drop', 'yellow', ['crown'], '开得了很多门，开不了自己的。'],
  ['xiaoyu', '小鱼', 'Fishy', 'sea', 'drop', 'cyan', ['fin'], '七秒记忆，所以每天都很新鲜。'],
  ['zhangyu', '章鱼', 'Octo', 'sea', 'circle', 'violet', ['tail'], '八只手，也忙不过来。'],
  ['haibao', '海豹', 'Seal', 'sea', 'pear', 'gray', ['freckles'], '胖得理直气壮。'],
  ['hetun', '河豚', 'Puffer', 'sea', 'circle', 'yellow', ['spike'], '生气的时候最好看。'],
  ['shuimu', '水母', 'Jellyfish', 'sea', 'ghost', 'cyan', ['fin'], '没有骨头，所以哪儿都能去。'],
  ['beike', '贝壳', 'Shell', 'sea', 'flower', 'pink', ['stripes'], '里面留着海的声音。'],
  ['haixing', '海星', 'Seastar', 'sea', 'star', 'orange', ['spots'], '断了一只角，还能长回来。'],
  ['jingyu', '鲸鱼', 'Whale', 'sea', 'pear', 'blue', [], '唱的歌，几百公里外都听得见。'],
  ['shanhu', '珊瑚', 'Coral', 'sea', 'flower', 'red', ['spike'], '看起来像植物，其实是动物。'],
  ['zhenzhuBei', '珍珠贝', 'PearlShell', 'sea', 'flower', 'white', ['starfield'], '把沙子磨成珍珠，用了很多年。'],
  ['maomi', '猫咪', 'Kitty', 'critter', 'circle', 'orange', ['catEar'], '叫它不理，不叫它反而来。'],
  ['tuzi', '兔子', 'Bunny', 'critter', 'pear', 'white', ['bunnyEar'], '耳朵比身体长，胆子比耳朵小。'],
  ['xiaoxiong', '小熊', 'Bear', 'critter', 'circle', 'orange', ['bearEar'], '看着凶，其实只想抱一下。'],
  ['xiaoji', '小鸡', 'Chick', 'critter', 'circle', 'yellow', ['sprout'], '跟着第一个看见的东西走。'],
  ['qie', '企鹅', 'Penguin', 'critter', 'pear', 'black', ['patch'], '穿得最正式，住得最冷。'],
  ['xiaozhu', '小猪', 'Piggy', 'critter', 'circle', 'pink', ['bearEar'], '吃和睡都很认真。'],
  ['huli', '狐狸', 'Fox', 'critter', 'drop', 'orange', ['foxEar'], '聪明，但懒得证明。'],
  ['shizi', '狮子', 'Lion', 'critter', 'circle', 'orange', ['fluff'], '鬃毛是它唯一的虚荣。'],
  ['cangshu', '仓鼠', 'Hamster', 'critter', 'circle', 'cream', ['bearEar'], '腮帮子里还有个仓库。'],
  ['ciwei', '刺猬', 'Hedgehog', 'critter', 'pear', 'gray', ['spike'], '抱起来会疼，但值得。'],
  ['kaola', '考拉', 'Koala', 'critter', 'circle', 'gray', ['bearEar'], '一天睡二十小时，剩下四小时发呆。'],
  ['bianfu', '蝙蝠', 'Batty', 'critter', 'circle', 'violet', ['catEar'], '用耳朵看世界。'],
  ['xiongmao', '熊猫', 'Panda', 'critter', 'circle', 'white', ['bearEar', 'patch'], '黑白分明，但态度模糊。'],
  ['yazi', '鸭子', 'Duck', 'critter', 'pear', 'yellow', ['sprout'], '走路摇，游泳稳。'],
  ['xiaoyuan', '小圆', 'Bob', 'people', 'circle', 'cream', [], '永远站在人群最中间的那个圆。'],
  ['wanzi', '丸子', 'Bunhead', 'people', 'circle', 'cream', ['flowerCrown'], '头发扎成一个球，脑子也是。'],
  ['citou', '刺头', 'Spiky', 'people', 'circle', 'blue', ['spike'], '不是叛逆，只是懒得梳。'],
  ['juanmao', '卷毛', 'Curly', 'people', 'blob', 'orange', ['fluff'], '睡醒就长这样，出门也这样。'],
  ['shuangbian', '双辫', 'Twintail', 'people', 'circle', 'pink', ['bow'], '甩起来会打到人。'],
  ['maozi', '帽子', 'Hatty', 'people', 'circle', 'cyan', ['crown'], '帽子才是本体，摘下来会认不出。'],
  ['yanjing', '眼镜', 'Specs', 'people', 'circle', 'gray', ['freckles'], '镜片后面的世界更清楚一点。'],
  ['weijin', '围巾', 'Scarf', 'people', 'circle', 'red', ['stripes'], '冬天的一半温暖在这里。'],
  ['meiqiu', '煤球', 'Coal', 'coal', 'blob', 'black', ['spots'], '脏，但是圆的。'],
  ['huihui', '灰灰', 'Ashy', 'coal', 'blob', 'gray', ['freckles'], '烧完了还剩一点温度。'],
  ['yanchong', '烟囱', 'Chimney', 'coal', 'pear', 'gray', ['patch'], '一直往上，从不回头。'],
  ['tanhuo', '炭火', 'Ember', 'coal', 'blob', 'black', ['starfield'], '里面还有火，只是看不见。'],
  ['momo', '墨墨', 'Ink', 'coal', 'blob', 'black', [], '滴下来是什么形状，它就是什么形状。'],
  ['huijin', '灰烬', 'Ash', 'coal', 'blob', 'gray', [], '曾经烧得很旺，现在很轻。'],
];

export const CAST: readonly CastMember[] = RAW.map(([id, zh, en, family, body, color, traits, desc]) => ({
  id,
  name: { zh, en },
  desc,
  family,
  body,
  color,
  traits,
}));

const BY_ID = new Map(CAST.map((m) => [m.id, m]));

export const CAST_IDS: readonly string[] = CAST.map((m) => m.id);

export function castMember(id: string): CastMember | undefined {
  return BY_ID.get(id);
}

export function castByFamily(family: string): readonly CastMember[] {
  return CAST.filter((m) => m.family === family);
}

/** Cross two members into a new genome. Deterministic for a given seed. */
export function breed(a: CastMember, b: CastMember, seed: number): CastMember {
  const pick = <T,>(x: T, y: T): T => (seed % 2 === 0 ? x : y);
  const traits = [...new Set([...a.traits.slice(0, Math.ceil(a.traits.length / 2)), ...b.traits.slice(Math.floor(b.traits.length / 2))])].slice(0, 4);
  return {
    id: `${a.id}+x+${b.id}#${seed % 997}`,
    name: { zh: `${a.name.zh}${b.name.zh}`, en: `${a.name.en}${b.name.en}` },
    desc: `${a.name.zh} 与 ${b.name.zh} 的后代。`,
    family: pick(a.family, b.family),
    body: pick(a.body, b.body),
    color: pick(a.color, b.color),
    traits,
  };
}
