'use client'

import { useRef, useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

// Dynamically import force graph to avoid SSR issues
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
})

interface GraphNode {
  id: string
  name: string
  canonicalName: string
  type: string
  group: number
}

interface GraphLink {
  id: string
  source: string | GraphNode
  target: string | GraphNode
  type: string
  label: string
  reverseLabel?: string
}

interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

interface KnowledgeGraphProps {
  data: GraphData
  onNodeClick: (nodeId: string) => void
  onNodeDoubleClick: (nodeId: string) => void
  centerId?: string | null
}

const ENTITY_TYPE_COLORS: Record<string, string> = {
  npc: '#22c55e',
  location: '#f59e0b',
  item: '#a855f7',
  quest: '#06b6d4',
  faction: '#f97316',
  lore: '#f43f5e',
  session: '#3b82f6',
  player_character: '#6366f1',
  freeform: '#6b7280',
}

export function KnowledgeGraph({
  data,
  onNodeClick,
  onNodeDoubleClick,
  centerId,
}: KnowledgeGraphProps) {
  const graphRef = useRef<any>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [hoveredLink, setHoveredLink] = useState<string | null>(null)

  useEffect(() => {
    const updateDimensions = () => {
      const container = document.getElementById('knowledge-graph-container')
      if (container) {
        setDimensions({
          width: container.clientWidth,
          height: 600,
        })
      }
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  useEffect(() => {
    // Zoom to fit after data loads
    if (graphRef.current && data.nodes.length > 0) {
      setTimeout(() => {
        graphRef.current?.zoomToFit(400, 50)
      }, 500)
    }
  }, [data])

  // Center on specific node if centerId changes
  useEffect(() => {
    if (graphRef.current && centerId) {
      const node = data.nodes.find(n => n.id === centerId)
      if (node) {
        graphRef.current.centerAt((node as any).x, (node as any).y, 500)
        graphRef.current.zoom(2, 500)
      }
    }
  }, [centerId, data.nodes])

  const handleNodeClick = useCallback(
    (node: any) => {
      onNodeClick(node.id)
    },
    [onNodeClick]
  )

  const handleNodeRightClick = useCallback(
    (node: any) => {
      onNodeDoubleClick(node.id)
    },
    [onNodeDoubleClick]
  )

  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const label = node.name || ''
      const fontSize = Math.max(10, 14 / globalScale)
      ctx.font = `${fontSize}px Inter, system-ui, sans-serif`

      const nodeColor = ENTITY_TYPE_COLORS[node.type] || '#6b7280'
      const isHovered = hoveredNode === node.id
      const isCentered = centerId === node.id

      // Node size based on connections
      const linkCount = data.links.filter(
        l => (l.source as any).id === node.id || (l.target as any).id === node.id ||
             l.source === node.id || l.target === node.id
      ).length
      const baseSize = 8 + Math.min(linkCount * 2, 12)
      const nodeSize = isHovered ? baseSize * 1.3 : (isCentered ? baseSize * 1.2 : baseSize)

      // Draw glow effect for hovered/centered nodes
      if (isHovered || isCentered) {
        ctx.beginPath()
        ctx.arc(node.x, node.y, nodeSize + 4, 0, 2 * Math.PI, false)
        ctx.fillStyle = nodeColor + '40'
        ctx.fill()
      }

      // Draw node circle
      ctx.beginPath()
      ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI, false)
      ctx.fillStyle = nodeColor
      ctx.fill()

      // Draw border
      ctx.strokeStyle = isHovered || isCentered ? '#ffffff' : 'rgba(255,255,255,0.5)'
      ctx.lineWidth = (isHovered || isCentered ? 2.5 : 1.5) / globalScale
      ctx.stroke()

      // Draw label
      const textWidth = ctx.measureText(label).width
      const padding = 4
      const labelY = node.y + nodeSize + fontSize + 2

      // Background for label
      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)'
      ctx.fillRect(
        node.x - textWidth / 2 - padding,
        labelY - fontSize / 2 - padding / 2,
        textWidth + padding * 2,
        fontSize + padding
      )

      // Label text
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = isHovered || isCentered ? '#ffffff' : 'rgba(255,255,255,0.8)'
      ctx.fillText(label, node.x, labelY)
    },
    [hoveredNode, centerId, data.links]
  )

  const linkCanvasObject = useCallback(
    (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const start = link.source
      const end = link.target

      if (!start.x || !end.x) return

      const isHovered = hoveredLink === link.id ||
        hoveredNode === start.id || hoveredNode === end.id

      // Draw line
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.strokeStyle = isHovered ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.15)'
      ctx.lineWidth = isHovered ? 2 : 1
      ctx.stroke()

      // Draw relationship label on hover
      if (isHovered && link.label) {
        const midX = (start.x + end.x) / 2
        const midY = (start.y + end.y) / 2

        const fontSize = Math.max(9, 11 / globalScale)
        ctx.font = `${fontSize}px Inter, system-ui, sans-serif`

        const labelText = link.label
        const textWidth = ctx.measureText(labelText).width
        const padding = 3

        // Background
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'
        ctx.fillRect(
          midX - textWidth / 2 - padding,
          midY - fontSize / 2 - padding / 2,
          textWidth + padding * 2,
          fontSize + padding
        )

        // Text
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = '#94a3b8'
        ctx.fillText(labelText, midX, midY)
      }
    },
    [hoveredNode, hoveredLink]
  )

  // Transform data for the graph library
  const graphData = {
    nodes: data.nodes.map((node) => ({
      ...node,
    })),
    links: data.links.map((link) => ({
      ...link,
      source: typeof link.source === 'string' ? link.source : link.source.id,
      target: typeof link.target === 'string' ? link.target : link.target.id,
    })),
  }

  return (
    <div id="knowledge-graph-container" className="w-full h-[600px] bg-slate-900 relative">
      <ForceGraph2D
        ref={graphRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        nodeCanvasObject={nodeCanvasObject}
        linkCanvasObject={linkCanvasObject}
        nodePointerAreaPaint={(node: any, color, ctx) => {
          const linkCount = data.links.filter(
            l => (l.source as any).id === node.id || (l.target as any).id === node.id ||
                 l.source === node.id || l.target === node.id
          ).length
          const baseSize = 8 + Math.min(linkCount * 2, 12)
          ctx.beginPath()
          ctx.arc(node.x, node.y, baseSize + 5, 0, 2 * Math.PI, false)
          ctx.fillStyle = color
          ctx.fill()
        }}
        onNodeClick={handleNodeClick}
        onNodeRightClick={handleNodeRightClick}
        onNodeHover={(node: any) => setHoveredNode(node?.id || null)}
        onLinkHover={(link: any) => setHoveredLink(link?.id || null)}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={0.9}
        linkCurvature={0.1}
        backgroundColor="#0f172a"
        cooldownTicks={100}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        onEngineStop={() => {
          if (!centerId) {
            graphRef.current?.zoomToFit(400, 50)
          }
        }}
      />

      {/* Tooltip for hovered node */}
      {hoveredNode && (
        <div className="absolute top-4 left-4 bg-slate-800 border border-slate-700 rounded-lg p-3 pointer-events-none">
          <p className="font-medium text-white">
            {data.nodes.find(n => n.id === hoveredNode)?.name}
          </p>
          <p className="text-sm text-slate-400 capitalize">
            {data.nodes.find(n => n.id === hoveredNode)?.type?.replace('_', ' ')}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Click to view, right-click to center
          </p>
        </div>
      )}
    </div>
  )
}
