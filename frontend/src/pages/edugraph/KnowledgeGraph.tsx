import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, ZoomIn, ZoomOut, Maximize2,
  Edit3, X, ChevronRight, Brain,
  MessageSquare, FileText, Target
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { KnowledgeNodePill, MasteryRing } from '@/components/edugraph/KnowledgeNodePill';

// ─── Mock Graph Data ──────────────────────────────────────────────────────────
interface KGNode {
  id: string;
  label: string;
  x: number; y: number;
  mastery: 'not_started' | 'in_progress' | 'mastered' | 'recommended';
  masteryPct: number;
  course: string;
  description: string;
  prerequisites: string[];
  leadsTo: string[];
  resources: { type: 'pdf' | 'video'; label: string }[];
}

interface KGEdge {
  from: string;
  to: string;
  type: 'prerequisite' | 'related' | 'part_of';
}

const NODES: KGNode[] = [
  { id: 'n1', label: '向量', x: 300, y: 200, mastery: 'mastered', masteryPct: 100, course: 'MATH201', description: '线性代数中最基本的对象，表示有方向和大小的量。', prerequisites: [], leadsTo: ['n2', 'n3'], resources: [{ type: 'pdf', label: '向量介绍.pdf' }] },
  { id: 'n2', label: '矩阵运算', x: 500, y: 150, mastery: 'mastered', masteryPct: 82, course: 'MATH201', description: '矩阵的加、减、乘法以及转置等基本运算规则。', prerequisites: ['n1'], leadsTo: ['n4', 'n5'], resources: [{ type: 'video', label: '矩阵运算讲解' }] },
  { id: 'n3', label: '线性组合', x: 150, y: 350, mastery: 'mastered', masteryPct: 90, course: 'MATH201', description: '向量的线性组合是将多个向量按一定系数进行加权求和。', prerequisites: ['n1'], leadsTo: ['n6'], resources: [] },
  { id: 'n4', label: '行列式', x: 650, y: 300, mastery: 'in_progress', masteryPct: 55, course: 'MATH201', description: '方阵的一种数值属性，用于刻画矩阵的可逆性。', prerequisites: ['n2'], leadsTo: ['n7'], resources: [{ type: 'pdf', label: '行列式理论.pdf' }] },
  { id: 'n5', label: '逆矩阵', x: 550, y: 400, mastery: 'in_progress', masteryPct: 40, course: 'MATH201', description: '若矩阵A与矩阵B相乘得单位矩阵，则互为逆矩阵。', prerequisites: ['n2', 'n4'], leadsTo: ['n8'], resources: [] },
  { id: 'n6', label: '向量空间', x: 150, y: 500, mastery: 'in_progress', masteryPct: 70, course: 'MATH201', description: '满足特定公理的向量的集合，支持线性组合运算。', prerequisites: ['n3'], leadsTo: ['n9'], resources: [{ type: 'video', label: '向量空间讲座' }] },
  { id: 'n7', label: '特征值', x: 750, y: 450, mastery: 'recommended', masteryPct: 0, course: 'MATH201', description: '矩阵作用于特征向量时产生的伸缩因子。', prerequisites: ['n4', 'n5'], leadsTo: ['n10'], resources: [] },
  { id: 'n8', label: '线性方程组', x: 400, y: 550, mastery: 'not_started', masteryPct: 0, course: 'MATH201', description: '多个线性方程构成的方程组，可用矩阵方法求解。', prerequisites: ['n5'], leadsTo: [], resources: [] },
  { id: 'n9', label: '基与维数', x: 200, y: 650, mastery: 'not_started', masteryPct: 0, course: 'MATH201', description: '向量空间的基是一组线性无关的生成集，基的大小即为维数。', prerequisites: ['n6'], leadsTo: [], resources: [] },
  { id: 'n10', label: 'SVD 分解', x: 680, y: 600, mastery: 'not_started', masteryPct: 0, course: 'MATH201', description: '奇异值分解，将任意矩阵分解为三个特殊矩阵的乘积。', prerequisites: ['n7'], leadsTo: [], resources: [{ type: 'pdf', label: 'SVD理论与应用.pdf' }] },
];

const EDGES: KGEdge[] = [
  { from: 'n1', to: 'n2', type: 'prerequisite' },
  { from: 'n1', to: 'n3', type: 'prerequisite' },
  { from: 'n2', to: 'n4', type: 'prerequisite' },
  { from: 'n2', to: 'n5', type: 'prerequisite' },
  { from: 'n3', to: 'n6', type: 'prerequisite' },
  { from: 'n4', to: 'n5', type: 'related' },
  { from: 'n4', to: 'n7', type: 'prerequisite' },
  { from: 'n5', to: 'n7', type: 'prerequisite' },
  { from: 'n5', to: 'n8', type: 'prerequisite' },
  { from: 'n6', to: 'n9', type: 'prerequisite' },
  { from: 'n7', to: 'n10', type: 'prerequisite' },
];

// ─── Node Visual Encoding ─────────────────────────────────────────────────────
const NODE_STYLES: Record<string, { fill: string; stroke: string; text: string }> = {
  not_started: { fill: 'white', stroke: '#CBD5E1', text: '#94A3B8' },
  in_progress: { fill: '#EFF6FF', stroke: '#60A5FA', text: '#2563EB' },
  mastered: { fill: '#F5F3FF', stroke: '#8B5CF6', text: '#7C3AED' },
  recommended: { fill: '#FFFBEB', stroke: '#FBBF24', text: '#D97706' },
};

const EDGE_STYLES: Record<string, { stroke: string; dasharray: string }> = {
  prerequisite: { stroke: '#94A3B8', dasharray: 'none' },
  related: { stroke: '#CBD5E1', dasharray: '4 3' },
  part_of: { stroke: '#BFDBFE', dasharray: '2 3' },
};

// ─── Detail Panel ─────────────────────────────────────────────────────────────
const NodeDetailPanel: React.FC<{ node: KGNode; onClose: () => void }> = ({ node, onClose }) => (
  <motion.aside
    initial={{ x: '100%', opacity: 0 }}
    animate={{ x: 0, opacity: 1 }}
    exit={{ x: '100%', opacity: 0 }}
    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
    className="absolute top-0 right-0 bottom-0 w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 flex flex-col shadow-2xl z-20"
  >
    {/* Header */}
    <div className="flex items-start justify-between p-5 border-b border-slate-100 dark:border-slate-800">
      <div className="flex items-center gap-3">
        <MasteryRing percent={node.masteryPct} size={44} />
        <div>
          <h2 className="font-bold text-slate-900 dark:text-slate-100">{node.label}</h2>
          <p className="text-xs text-slate-500">{node.course}</p>
        </div>
      </div>
      <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
        <X className="w-4 h-4 text-slate-400" />
      </button>
    </div>

    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      {/* Mastery bar */}
      <div>
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-slate-500">掌握度</span>
          <span className="font-semibold text-slate-700 dark:text-slate-300">{node.masteryPct}%</span>
        </div>
        <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', node.masteryPct >= 80 ? 'bg-purple-500' : node.masteryPct >= 40 ? 'bg-blue-400' : 'bg-slate-300')}
            style={{ width: `${node.masteryPct}%` }}
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">概念说明</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{node.description}</p>
      </div>

      {/* Prerequisites */}
      {node.prerequisites.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
            <ChevronRight className="w-3 h-3 rotate-180" /> 前置概念
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {node.prerequisites.map(pid => {
              const pre = NODES.find(n => n.id === pid);
              return pre ? <KnowledgeNodePill key={pid} concept={pre.label} mastery={pre.mastery} /> : null;
            })}
          </div>
        </div>
      )}

      {/* Leads to */}
      {node.leadsTo.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
            <ChevronRight className="w-3 h-3" /> 衍生概念
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {node.leadsTo.map(lid => {
              const next = NODES.find(n => n.id === lid);
              return next ? <KnowledgeNodePill key={lid} concept={next.label} mastery={next.mastery} /> : null;
            })}
          </div>
        </div>
      )}

      {/* Resources */}
      {node.resources.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">学习资料</h3>
          <div className="space-y-1.5">
            {node.resources.map((r, i) => (
              <button key={i} className="w-full flex items-center gap-2 text-xs text-slate-600 hover:text-blue-600 p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors text-left">
                {r.type === 'pdf' ? <FileText className="w-3.5 h-3.5 flex-shrink-0" /> : <Target className="w-3.5 h-3.5 flex-shrink-0" />}
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* AI Actions */}
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">AI 助手</h3>
        <div className="space-y-1.5">
          {[
            { icon: MessageSquare, label: `解释「${node.label}」` },
            { icon: FileText, label: '生成练习题' },
            { icon: Brain, label: '展示前置链路' },
          ].map(({ icon: Icon, label }) => (
            <button key={label} className="w-full flex items-center gap-2 text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/10 p-2.5 rounded-xl border border-blue-100 dark:border-blue-900 transition-colors text-left">
              <Icon className="w-3.5 h-3.5 flex-shrink-0" /> {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  </motion.aside>
);

// ─── Knowledge Graph Page ───────────────────────────────────────────────────
export const KnowledgeGraph: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<KGNode | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [masteryFilter, setMasteryFilter] = useState<string>('all');

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as Element).tagName === 'svg') {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setPanStart({ ...pan });
    }
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: panStart.x + (e.clientX - dragStart.x), y: panStart.y + (e.clientY - dragStart.y) });
  }, [isDragging, dragStart, panStart]);

  const handleMouseUp = () => setIsDragging(false);

  const filteredNodes = NODES.filter(n => {
    const matchSearch = !searchQuery || n.label.toLowerCase().includes(searchQuery.toLowerCase());
    const matchMastery = masteryFilter === 'all' || n.mastery === masteryFilter;
    return matchSearch && matchMastery;
  });
  const filteredNodeIds = new Set(filteredNodes.map(n => n.id));

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索概念..."
            className="pl-8 pr-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-800 rounded-lg border-none outline-none focus:ring-2 focus:ring-blue-500 w-44"
          />
        </div>

        <select
          value={masteryFilter}
          onChange={e => setMasteryFilter(e.target.value)}
          className="text-sm bg-slate-100 dark:bg-slate-800 border-none rounded-lg px-3 py-1.5 outline-none"
        >
          <option value="all">全部掌握度</option>
          <option value="not_started">未开始</option>
          <option value="in_progress">进行中</option>
          <option value="mastered">已掌握</option>
          <option value="recommended">AI 推荐</option>
        </select>

        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
          <button onClick={() => setZoom(z => Math.min(z + 0.2, 3))} className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-md transition-colors">
            <ZoomIn className="w-4 h-4 text-slate-600" />
          </button>
          <span className="text-xs text-slate-500 px-1">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.max(z - 0.2, 0.3))} className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-md transition-colors">
            <ZoomOut className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        <button
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-500" title="重置视图"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        <button
          onClick={() => setEditMode(e => !e)}
          className={cn('ml-auto flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors', editMode ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 dark:bg-slate-800 text-slate-600')}
        >
          <Edit3 className="w-3.5 h-3.5" /> {editMode ? '退出编辑' : '编辑模式'}
        </button>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[10px] text-slate-400">
          {[
            { color: '#CBD5E1', label: '未开始' }, { color: '#60A5FA', label: '进行中' },
            { color: '#8B5CF6', label: '已掌握' }, { color: '#FBBF24', label: 'AI推荐' },
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: color }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden">
        <svg
          ref={svgRef}
          className={cn('w-full h-full', isDragging ? 'cursor-grabbing' : 'cursor-grab')}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {/* Edges */}
            <defs>
              <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill="#94A3B8" />
              </marker>
            </defs>
            {EDGES.map((edge, i) => {
              const from = NODES.find(n => n.id === edge.from);
              const to = NODES.find(n => n.id === edge.to);
              if (!from || !to) return null;
              const style = EDGE_STYLES[edge.type];
              const dimmed = (!filteredNodeIds.has(edge.from) || !filteredNodeIds.has(edge.to)) && searchQuery;
              return (
                <line
                  key={i}
                  x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                  stroke={style.stroke}
                  strokeWidth={1.5}
                  strokeDasharray={style.dasharray === 'none' ? undefined : style.dasharray}
                  markerEnd={edge.type === 'prerequisite' ? 'url(#arrow)' : undefined}
                  opacity={dimmed ? 0.15 : 0.7}
                />
              );
            })}

            {/* Nodes */}
            {NODES.map((node) => {
              const style = NODE_STYLES[node.mastery];
              const isSelected = selectedNode?.id === node.id;
              const isFiltered = !filteredNodeIds.has(node.id) && (searchQuery || masteryFilter !== 'all');
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x},${node.y})`}
                  onClick={() => setSelectedNode(isSelected ? null : node)}
                  style={{ cursor: 'pointer', opacity: isFiltered ? 0.2 : 1 }}
                >
                  {/* Pulse ring for recommended */}
                  {node.mastery === 'recommended' && (
                    <circle r={28} fill="none" stroke="#FBBF24" strokeWidth={2} opacity={0.5} className="animate-ping" style={{ transformOrigin: '0 0' }} />
                  )}
                  {/* Selection ring */}
                  {isSelected && (
                    <circle r={28} fill="none" stroke="#3B82F6" strokeWidth={3} opacity={0.8} />
                  )}
                  {/* Main circle */}
                  <circle r={22} fill={style.fill} stroke={style.stroke} strokeWidth={2} />
                  {/* Label */}
                  <text textAnchor="middle" dy="4" fontSize={10} fontWeight="600" fill={style.text} style={{ userSelect: 'none' }}>
                    {node.label.length > 4 ? node.label.substring(0, 4) : node.label}
                  </text>
                  {/* Below label */}
                  <text textAnchor="middle" dy={38} fontSize={9} fill="#64748B" style={{ userSelect: 'none' }}>
                    {node.label.length > 4 ? node.label.substring(0, 6) : node.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Node Detail Panel */}
        <AnimatePresence>
          {selectedNode && (
            <NodeDetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
          )}
        </AnimatePresence>

        {/* Edit mode hint */}
        {editMode && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 text-xs px-4 py-2 rounded-full border border-amber-200">
            <Edit3 className="w-3 h-3 inline mr-1" /> 编辑模式 — 点击画布添加节点，拖拽节点创建关系
          </div>
        )}
      </div>
    </div>
  );
};
