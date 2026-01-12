'use client'

import { useRef, useCallback, useEffect, useState, useMemo } from 'react'
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

// Medieval/Fantasy color palette for entity types
const ENTITY_TYPE_COLORS: Record<string, string> = {
  // Characters - warm greens (forest/nature)
  npc: '#4a7c59',           // Forest green
  player_character: '#2d5a3d', // Dark forest
  creature: '#6b8e4e',      // Moss green

  // Places - warm amber/gold (torchlit maps)
  location: '#c4883a',      // Warm amber
  region: '#a67c3d',        // Antique gold

  // Items - rich purples (magical)
  item: '#7b5ea7',          // Royal purple
  artifact: '#9b6bb5',      // Mystical violet
  spell: '#8e6faf',         // Arcane purple
  ability: '#a077bf',       // Light arcane

  // Quests & Events - deep burgundy/crimson
  quest: '#8b3a3a',         // Parchment red
  event: '#a04545',         // Blood red

  // Organizations - burnt orange/sienna
  faction: '#b5651d',       // Burnt sienna
  organization: '#cd7f32',  // Bronze

  // Knowledge - deep blue (ink)
  lore: '#4a5568',          // Ink gray
  session: '#3d5a80',       // Scholar blue

  // Divine/Racial - gold/teal
  deity: '#d4a942',         // Divine gold
  race: '#457b6d',          // Verdigris
  class: '#5c7a5e',         // Sage green

  // Conditions/Materials - earth tones
  condition: '#8b4513',     // Saddle brown
  material: '#6b5344',      // Umber
}

const FALLBACK_COLORS = ['#6b5344', '#5c5c5c', '#7a6a5a', '#4a5568', '#5a4a3a']

function getTypeColor(type: string): string {
  if (ENTITY_TYPE_COLORS[type]) return ENTITY_TYPE_COLORS[type]
  // Generate consistent color based on type name hash
  const hash = type.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length]
}

export function KnowledgeGraph({
  data,
  onNodeClick,
  onNodeDoubleClick,
  centerId,
}: KnowledgeGraphProps) {
  const graphRef = useRef<any>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  // Use refs for hover state to avoid re-renders that restart the simulation
  const hoveredNodeRef = useRef<string | null>(null)
  const hoveredLinkRef = useRef<string | null>(null)
  // Only use state for the tooltip display
  const [tooltipNode, setTooltipNode] = useState<string | null>(null)

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

  // Precompute link counts for each node
  const nodeLinkCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const link of data.links) {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id
      const targetId = typeof link.target === 'string' ? link.target : link.target.id
      counts.set(sourceId, (counts.get(sourceId) || 0) + 1)
      counts.set(targetId, (counts.get(targetId) || 0) + 1)
    }
    return counts
  }, [data.links])

  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const label = node.name || ''
      const fontSize = Math.max(10, 14 / globalScale)
      ctx.font = `${fontSize}px Inter, system-ui, sans-serif`

      const nodeColor = getTypeColor(node.type)
      const isHovered = hoveredNodeRef.current === node.id
      const isCentered = centerId === node.id

      // Node size based on connections (use precomputed counts)
      const linkCount = nodeLinkCounts.get(node.id) || 0
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

      // Draw border - golden highlight
      ctx.strokeStyle = isHovered || isCentered ? '#d4a942' : 'rgba(212, 169, 66, 0.4)'
      ctx.lineWidth = (isHovered || isCentered ? 2.5 : 1.5) / globalScale
      ctx.stroke()

      // Draw label
      const textWidth = ctx.measureText(label).width
      const padding = 4
      const labelY = node.y + nodeSize + fontSize + 2

      // Background for label - parchment style
      ctx.fillStyle = 'rgba(42, 35, 24, 0.9)'
      ctx.fillRect(
        node.x - textWidth / 2 - padding,
        labelY - fontSize / 2 - padding / 2,
        textWidth + padding * 2,
        fontSize + padding
      )

      // Label text - parchment color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = isHovered || isCentered ? '#e8dcc8' : 'rgba(232, 220, 200, 0.85)'
      ctx.fillText(label, node.x, labelY)
    },
    [centerId, nodeLinkCounts]
  )

  const linkCanvasObject = useCallback(
    (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const start = link.source
      const end = link.target

      if (!start.x || !end.x) return

      const isHovered = hoveredLinkRef.current === link.id ||
        hoveredNodeRef.current === start.id || hoveredNodeRef.current === end.id

      // Draw line - parchment/golden tones
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.strokeStyle = isHovered ? 'rgba(212, 169, 66, 0.7)' : 'rgba(139, 119, 90, 0.25)'
      ctx.lineWidth = isHovered ? 2 : 1
      ctx.stroke()

      // Draw relationship label on hover
      if (isHovered && link.label) {
        const midX = (start.x + end.x) / 2
        const midY = (start.y + end.y) / 2

        const fontSize = Math.max(9, 11 / globalScale)
        ctx.font = `${fontSize}px Crimson Pro, Georgia, serif`

        const labelText = link.label
        const textWidth = ctx.measureText(labelText).width
        const padding = 3

        // Background - dark parchment
        ctx.fillStyle = 'rgba(42, 35, 24, 0.95)'
        ctx.fillRect(
          midX - textWidth / 2 - padding,
          midY - fontSize / 2 - padding / 2,
          textWidth + padding * 2,
          fontSize + padding
        )

        // Text - gold/parchment
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = '#d4a942'
        ctx.fillText(labelText, midX, midY)
      }
    },
    [] // No dependencies - refs don't trigger re-renders
  )

  // Memoize graph data transformation to prevent unnecessary re-renders
  const graphData = useMemo(() => ({
    nodes: data.nodes.map((node) => ({
      ...node,
    })),
    links: data.links.map((link) => ({
      ...link,
      source: typeof link.source === 'string' ? link.source : link.source.id,
      target: typeof link.target === 'string' ? link.target : link.target.id,
    })),
  }), [data])

  return (
    <div id="knowledge-graph-container" className="w-full h-[600px] bg-[#2a2318] relative border-2 border-[hsl(30_25%_30%)]">
      <ForceGraph2D
        ref={graphRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        nodeCanvasObject={nodeCanvasObject}
        linkCanvasObject={linkCanvasObject}
        nodePointerAreaPaint={(node: any, color, ctx) => {
          const linkCount = nodeLinkCounts.get(node.id) || 0
          const baseSize = 8 + Math.min(linkCount * 2, 12)
          ctx.beginPath()
          ctx.arc(node.x, node.y, baseSize + 5, 0, 2 * Math.PI, false)
          ctx.fillStyle = color
          ctx.fill()
        }}
        onNodeClick={handleNodeClick}
        onNodeRightClick={handleNodeRightClick}
        onNodeHover={(node: any) => {
          hoveredNodeRef.current = node?.id || null
          setTooltipNode(node?.id || null) // Only this triggers re-render for tooltip
        }}
        onLinkHover={(link: any) => {
          hoveredLinkRef.current = link?.id || null
        }}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={0.9}
        linkCurvature={0.1}
        backgroundColor="#2a2318"
        cooldownTicks={100}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        onEngineStop={() => {
          if (!centerId) {
            graphRef.current?.zoomToFit(400, 50)
          }
        }}
      />

      {/* Tooltip for hovered node - parchment style */}
      {tooltipNode && (
        <div className="absolute top-4 left-4 bg-[#3d3426] border-2 border-[#6b5a45] rounded-sm p-3 pointer-events-none shadow-lg">
          <p className="font-medium text-[#e8dcc8]" style={{ fontFamily: 'Cinzel, serif' }}>
            {data.nodes.find(n => n.id === tooltipNode)?.name}
          </p>
          <p className="text-sm text-[#b8a88a] capitalize" style={{ fontFamily: 'Crimson Pro, serif' }}>
            {data.nodes.find(n => n.id === tooltipNode)?.type?.replace('_', ' ')}
          </p>
          <p className="text-xs text-[#8a7a66] mt-1">
            Click to view, right-click to center
          </p>
        </div>
      )}
    </div>
  )
}
