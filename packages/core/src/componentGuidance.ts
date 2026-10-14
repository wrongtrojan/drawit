import type { NodeType } from "./schema.js";

export interface ComponentGuidance { usage: string; semanticFields: string[]; compositionOrder: string[] }
const independent = ["创建节点后按对象 id 连接；位置相对画布，有 parentId 时相对父节点。"];
const basic = (usage: string): ComponentGuidance => ({ usage, semanticFields: ["text"], compositionOrder: independent });
export const componentGuidance: Record<NodeType, ComponentGuidance> = {
  rectangle: basic("普通信息块；领域语义图应优先选择对应专用类型。"),
  roundedRectangle: basic("步骤、模块或残差相加，用 text 写清含义。"), ellipse: basic("椭圆信息块。"), diamond: basic("普通分支或判断。"), triangle: basic("三角形示意。"), polygon: { ...basic("自定义多边形示意。"), semanticFields: ["points", "text"] }, text: basic("图标题、形状标注或计算说明。"), note: basic("无目标的文字注释。"),
  container: { usage: "架构分层、模块分组或复盘分区。", semanticFields: ["title"], compositionOrder: ["先创建容器，再以 parentId 放入节点；子节点坐标相对容器。", "最后连接子节点 id 表示依赖。"] },
  image: { usage: "本地内嵌图像素材。", semanticFields: ["src", "alt"], compositionOrder: independent },
  annotation: { usage: "解释公式、矩阵或其他目标，targetId 生成指向目标的箭头。", semanticFields: ["text", "targetId"], compositionOrder: ["先创建目标节点，再将其 id 填入 targetId。"] },
  flowchart: { usage: "二分查找、训练步或发布流程；kind 选择起止、处理、判断和输入输出。", semanticFields: ["kind", "text"], compositionOrder: ["先创建各步骤，再用连线标签写 yes/no 或通过/不通过。"] },
  lifeline: { usage: "时序图参与者及其生命线。", semanticFields: ["text"], compositionOrder: ["先放所有生命线，给出稳定 id 和一致的纵向起点。"] },
  message: { usage: "时序请求、异步通知或返回消息。", semanticFields: ["text", "sourceId", "targetId", "messageKind"], compositionOrder: ["先放同一父容器内的生命线，再用 sourceId/targetId 引用它们。", "消息 y 表示时间顺序；messageKind 为 sync、async 或 return。"] },
  activation: { usage: "参与者处理消息的持续时间。", semanticFields: ["lifelineId"], compositionOrder: ["先创建生命线，再引用 lifelineId；y 和 height 表示时间段。"] },
  table: { usage: "页表、指标或业务表格；合并中的 row 0 是表头。", semanticFields: ["headers", "cells", "merges"], compositionOrder: ["先填写表头与矩形二维数据，再指定不重叠的合并区域。"] },
  array: { usage: "有序数组和索引定位，用 highlightIndex 高亮元素。", semanticFields: ["items", "highlightIndex"], compositionOrder: independent },
  stack: { usage: "后进先出栈，items 从顶部到底部。", semanticFields: ["items", "highlightIndex"], compositionOrder: independent },
  queue: { usage: "先进先出队列，items 从队首到队尾。", semanticFields: ["items", "highlightIndex"], compositionOrder: independent },
  tree: { usage: "概率树、组织关系或层级结构；允许重名标签，父子关系由 children 保存。", semanticFields: ["root"], compositionOrder: ["填写递归 root/children，包含各层孩子；不要拆成匿名矩形。"] },
  graph: { usage: "带边标签的路径、依赖网络或一般图。", semanticFields: ["vertices", "links", "directed"], compositionOrder: ["先列具有唯一 id 的 vertices，再让 links 引用顶点 id。", "无环有向图按层次绘制，循环图采用网格布局。"] },
  equation: { usage: "贝叶斯先验、似然、证据和后验的公式，也用于其他 LaTeX 数学关系。", semanticFields: ["latex"], compositionOrder: independent },
  matrix: { usage: "矩阵乘法，填写 cells 并用 highlightRows、highlightCols、highlightCells 指定行、列和结果元素。", semanticFields: ["cells", "highlightRows", "highlightCols", "highlightCells"], compositionOrder: ["先创建能相乘的矩阵，再局部高亮对应行列和结果元素，补公式与形状说明。"] },
  vector: { usage: "向量分量，orientation 选择行或列。", semanticFields: ["components", "orientation"], compositionOrder: independent },
  brace: { usage: "括号和维度范围标注。", semanticFields: ["side", "label"], compositionOrder: independent },
  class: { usage: "UML 类图，保留类名、属性、方法和可选构造型。", semanticFields: ["name", "attributes", "methods", "stereotype"], compositionOrder: ["先创建 class 节点，再用现有连线与继承、关联或依赖标签连接类。"] },
  entity: { usage: "ER 实体及属性。", semanticFields: ["name", "attributes"], compositionOrder: ["先放 entity，再放 relationship，连线标签填写基数。"] },
  relationship: { usage: "ER 联系的菱形语义节点。", semanticFields: ["name"], compositionOrder: ["先创建实体和联系，再用现有连线表示 1、N 等基数。"] },
  state: { usage: "状态机中的初始、普通和最终状态。", semanticFields: ["kind", "text"], compositionOrder: ["kind 为 initial、state、final；先放状态，再用带事件标签的连线表示转移。"] },
  swimlane: { usage: "按参与者或职责分区的计算机流程和办公流程。", semanticFields: ["title", "direction"], compositionOrder: ["先创建横向 horizontal 或纵向 vertical 泳道，再用 parentId 放入步骤。", "坐标相对泳道，最后连接步骤 id 表示跨泳道流程。"] },
  axis: { usage: "数轴、区间、坐标系或向量方向。", semanticFields: ["title", "direction", "min", "max", "ticks"], compositionOrder: ["设置 min < max；ticks.value 在区间内，方向为 horizontal 或 vertical。", "需要坐标系时组合两条轴。"] },
  tensor: { usage: "AI 数据张量，保留名字和形状，如 x 与 [B, T, d]。", semanticFields: ["name", "shape"], compositionOrder: ["先创建张量，再用连线连接注意力、前馈或其他处理块。"] },
  timeline: { usage: "发布节奏或项目里程碑。", semanticFields: ["title", "milestones"], compositionOrder: ["每项包含有效 YYYY-MM-DD date 与 label；按日期排序展示，同日里程碑分别保留。"] },
};
