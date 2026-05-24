import { AdvancedTemplateHandlers } from "../src/handlers/advancedTemplateHandlers.js";

const baseImg = "C:\\Users\\Administrator\\WPSDrive\\458411131\\WPS云盘\\DAGA\\苏州活力大厦\\251023\\";

const plan = [
  {
    master: 'A-封面',
    values: {
      '项目中文名': { text: '苏州活力大厦改造方案' },
      '项目英文名': { text: 'Suzhou Vitality Tower Renewal' },
      '公司中文名': { text: '灵构建筑工作室' },
      '公司英文名': { text: 'LINGGOU ARCHITECTS' },
      '日期': { text: '2025 年 10 月' },
      '背景图片': { imagePath: baseImg + 'ComfyUI_01526_.png', fit: 'FILL_FRAME', clearExisting: true }
    }
  },
  {
    master: 'A-目录',
    values: {
      '目录页标题': { text: '目录' },
      '目录正文': { text: '一、城市与区位洞察\r二、现状诊断与价值发掘\r三、设计策略与空间激活\r四、立面更新与灯光演绎\r五、绿色技术与运营模式\r六、实施排期与风险控制' }
    }
  },
  {
    master: 'B-篇章分隔页',
    values: {
      '篇章标题': { text: 'Chapter 01  城市与区位洞察' }
    }
  },
  {
    master: 'C-单图4:3左文右图',
    values: {
      '分页标题': { text: '区域动能与人流剖面' },
      '要点说明': { text: '项目位于苏州老城与工业园交界处，是轨交与滨河双动线的节点。\r• 三公里范围内集聚创新型企业，日均人流 3.5 万人。\r• 通过复合功能补强，承接溢出的办公、展示与社交需求。' },
      '右侧图片': { imagePath: baseImg + 'photo01.jpg', fit: 'FILL_FRAME', clearExisting: true }
    }
  },
  {
    master: 'D-左说明图右现状照片群组',
    values: {
      '分页标题': { text: '现状诊断与更新诉求' },
      '要点说明': { text: '1. 塔楼底部封闭，商业首层空置率高。\r2. 立面老旧，夜间识别度弱，缺乏品牌表达。\r3. 交通组织割裂，车行与步行流线冲突。\r4. 灰空间积水、绿化破损，缺乏停留节点。' },
      '左下大图图1': { imagePath: baseImg + 'photo02.jpg', fit: 'FILL_FRAME', clearExisting: true },
      '图2': { imagePath: baseImg + 'photo03.jpg', fit: 'FILL_FRAME', clearExisting: true },
      '图3': { imagePath: baseImg + 'photo04.jpg', fit: 'FILL_FRAME', clearExisting: true },
      '图4': { imagePath: baseImg + 'photo05.jpg', fit: 'FILL_FRAME', clearExisting: true },
      '图5': { imagePath: baseImg + 'photo06.jpg', fit: 'FILL_FRAME', clearExisting: true }
    }
  },
  {
    master: 'B-篇章分隔页',
    values: {
      '篇章标题': { text: 'Chapter 02  设计策略与空间激活' }
    }
  },
  {
    master: 'E-16:9单图',
    values: {
      '分页标题': { text: '立体公共客厅概念草图' },
      '主图': { imagePath: baseImg + 'ComfyUI_01528_.png', fit: 'FILL_FRAME', clearExisting: true }
    }
  },
  {
    master: 'L-3：4单图居中',
    values: {
      '分页标题': { text: '中庭慢行环与复合社交场景' },
      '左下大图图1': { imagePath: baseImg + 'photo07.jpg', fit: 'FILL_FRAME', clearExisting: true }
    }
  },
  {
    master: 'H-三张竖构图',
    values: {
      '左图1': { imagePath: baseImg + 'photo03.jpg', fit: 'FILL_FRAME', clearExisting: true },
      '中图2': { imagePath: baseImg + 'photo04.jpg', fit: 'FILL_FRAME', clearExisting: true },
      '右图3': { imagePath: baseImg + 'photo05.jpg', fit: 'FILL_FRAME', clearExisting: true }
    }
  },
  {
    master: 'I-两张竖构图',
    values: {
      '分页标题': { text: '双层幕墙与可调光翼板' },
      '左图1': { imagePath: baseImg + 'photo06.jpg', fit: 'FILL_FRAME', clearExisting: true },
      '右图2': { imagePath: baseImg + 'photo07.jpg', fit: 'FILL_FRAME', clearExisting: true }
    }
  },
  {
    master: 'J-网格四图',
    values: {
      '分页标题': { text: '地面界面活化策略' },
      '左上图1': { imagePath: baseImg + 'photo08.jpg', fit: 'FILL_FRAME', clearExisting: true },
      '右上图2': { imagePath: baseImg + 'photo01.jpg', fit: 'FILL_FRAME', clearExisting: true },
      '左下图3': { imagePath: baseImg + 'photo02.jpg', fit: 'FILL_FRAME', clearExisting: true },
      '右下图4': { imagePath: baseImg + 'photo03.jpg', fit: 'FILL_FRAME', clearExisting: true }
    }
  },
  {
    master: 'F-自由页',
    values: {
      '分页标题': { text: '开放式共享运营模式\r• 市集 + 展厅 + 夜间演艺\r• AI 导览与无现金服务\r• 社区共管与品牌孵化' }
    }
  },
  {
    master: 'G-对标案例图文页',
    values: {
      '分页标题': { text: '对标案例与启发' },
      '正文描述': { text: '深圳南头古城更新强调“慢行串联 + 复合功能”；上海前滩中心则以“立体绿化 + 夜间灯光”提升辨识度。两者共同启示我们：商业首层必须打开，与城市公共界面形成连续体验。' },
      '右上图1': { imagePath: baseImg + 'photo04.jpg', fit: 'FILL_FRAME', clearExisting: true },
      '左下图2': { imagePath: baseImg + 'photo05.jpg', fit: 'FILL_FRAME', clearExisting: true },
      '图3': { imagePath: baseImg + 'photo06.jpg', fit: 'FILL_FRAME', clearExisting: true },
      '图4': { imagePath: baseImg + 'photo07.jpg', fit: 'FILL_FRAME', clearExisting: true }
    }
  },
  {
    master: 'Z-结尾感谢页',
    values: {
      '致谢': { text: '感谢各位评审与合作伙伴的关注。期待与您共同推动苏州活力大厦焕新，实现城市、商业与社区的多赢。' }
    }
  }
];

const run = async () => {
  for (const step of plan) {
    const createRes = await AdvancedTemplateHandlers.createPageWithTemplate({ templateName: step.master });
    if (!createRes.success) {
      console.error('创建页面失败', step.master, createRes.result);
      throw new Error('create failed');
    }
    const pageIndex = createRes.result.pageIndex;
    const fillRes = await AdvancedTemplateHandlers.fillTemplateFromSlots({ pageIndex, values: step.values });
    if (!fillRes.success) {
      console.error('填充失败', step.master, fillRes.result);
      throw new Error('fill failed');
    }
    console.log(`完成 ${step.master} -> 页码 ${pageIndex}`);
  }
};

run().catch((err) => {
  console.error('执行出错', err);
  process.exit(1);
});
