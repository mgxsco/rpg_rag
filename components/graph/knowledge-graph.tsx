'use client'

import { useRef, useCallback, useEffect, useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { getEntityTypeColor } from '@/lib/entity-colors'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Network,
  GitBranch,
  Circle,
  Box,
  ArrowDown,
  ArrowUp,
  ArrowRight,
  ArrowLeft,
  Target,
  Zap,
  Snowflake,
  Gauge,
} from 'lucide-react'

// Dynamically import force graphs to avoid SSR issues
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
})

const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), {
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

// Layout modes for 2D graph
type LayoutMode = 'force' | 'td' | 'bu' | 'lr' | 'rl' | 'radialout' | 'radialin' | null
type ViewMode = '2d' | '3d'
type PhysicsPreset = 'default' | 'fast' | 'slow' | 'frozen'

interface LayoutOption {
  mode: LayoutMode
  label: string
  icon: React.ReactNode
  description: string
}

interface PhysicsOption {
  preset: PhysicsPreset
  label: string
  icon: React.ReactNode
  config: {
    d3AlphaDecay: number
    d3VelocityDecay: number
    cooldownTicks: number
    warmupTicks: number
  }
}

const layoutOptions: LayoutOption[] = [
  { mode: 'force', label: 'Force', icon: <Network className="h-4 w-4" />, description: 'Classic force-directed' },
  { mode: 'td', label: 'Tree Down', icon: <ArrowDown className="h-4 w-4" />, description: 'Top-down hierarchy' },
  { mode: 'bu', label: 'Tree Up', icon: <ArrowUp className="h-4 w-4" />, description: 'Bottom-up hierarchy' },
  { mode: 'lr', label: 'Tree Right', icon: <ArrowRight className="h-4 w-4" />, description: 'Left-to-right flow' },
  { mode: 'rl', label: 'Tree Left', icon: <ArrowLeft className="h-4 w-4" />, description: 'Right-to-left flow' },
  { mode: 'radialout', label: 'Radial Out', icon: <Target className="h-4 w-4" />, description: 'Radial from center' },
  { mode: 'radialin', label: 'Radial In', icon: <Circle className="h-4 w-4" />, description: 'Radial inward' },
]

const physicsOptions: PhysicsOption[] = [
  {
    preset: 'default',
    label: 'Balanced',
    icon: <Gauge className="h-4 w-4" />,
    config: { d3AlphaDecay: 0.02, d3VelocityDecay: 0.3, cooldownTicks: 100, warmupTicks: 0 },
  },
  {
    preset: 'fast',
    label: 'Fast',
    icon: <Zap className="h-4 w-4" />,
    config: { d3AlphaDecay: 0.05, d3VelocityDecay: 0.4, cooldownTicks: 50, warmupTicks: 0 },
  },
  {
    preset: 'slow',
    label: 'Smooth',
    icon: <Snowflake className="h-4 w-4" />,
    config: { d3AlphaDecay: 0.01, d3VelocityDecay: 0.2, cooldownTicks: 200, warmupTicks: 0 },
  },
  {
    preset: 'frozen',
    label: 'Instant',
    icon: <Snowflake className="h-4 w-4" />,
    config: { d3AlphaDecay: 1, d3VelocityDecay: 1, cooldownTicks: 0, warmupTicks: 200 },
  },
]

// Use centralized entity colors for graph visualization
function getTypeColor(type: string): string {
  const colors = getEntityTypeColor(type)
  return colors.hex
}

export function KnowledgeGraph({
  data,
  onNodeClick,
  onNodeDoubleClick,
  centerId,
}: KnowledgeGraphProps) {
  const graphRef = useRef<any>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const hoveredNodeRef = useRef<string | null>(null)
  const hoveredLinkRef = useRef<string | null>(null)
  const [tooltipNode, setTooltipNode] = useState<string | null>(null)

  // Layout and view state
  const [viewMode, setViewMode] = useState<ViewMode>('2d')
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('force')
  const [physicsPreset, setPhysicsPreset] = useState<PhysicsPreset>('default')

  const currentLayout = layoutOptions.find((l) => l.mode === layoutMode) || layoutOptions[0]
  const currentPhysics = physicsOptions.find((p) => p.preset === physicsPreset) || physicsOptions[0]

  useEffect(() => {
    const updateDimensions = () => {
      const container = document.getElementById('knowledge-graph-container')
      if (container) {
        setDimensions({
          width: container.clientWidth,
          height: container.clientHeight || 600,
        })
      }
    }

    updateDimensions()
    setTimeout(updateDimensions, 100)

    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  useEffect(() => {
    if (graphRef.current && data.nodes.length > 0) {
      setTimeout(() => {
        graphRef.current?.zoomToFit(400, 50)
      }, 500)
    }
  }, [data, viewMode, layoutMode])

  useEffect(() => {
    if (graphRef.current && centerId) {
      const node = data.nodes.find((n) => n.id === centerId)
      if (node) {
        if (viewMode === '2d') {
          graphRef.current.centerAt((node as any).x, (node as any).y, 500)
          graphRef.current.zoom(2, 500)
        } else {
          // 3D centering
          graphRef.current.cameraPosition(
            { x: (node as any).x, y: (node as any).y, z: 300 },
            node,
            1000
          )
        }
      }
    }
  }, [centerId, data.nodes, viewMode])

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
    if (!data.links) return counts
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

      const linkCount = nodeLinkCounts.get(node.id) || 0
      const baseSize = 8 + Math.min(linkCount * 2, 12)
      const nodeSize = isHovered ? baseSize * 1.3 : isCentered ? baseSize * 1.2 : baseSize

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
      ctx.lineWidth = ((isHovered || isCentered ? 2.5 : 1.5) / globalScale)
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

      const isHovered =
        hoveredLinkRef.current === link.id ||
        hoveredNodeRef.current === start.id ||
        hoveredNodeRef.current === end.id

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
    []
  )

  // 3D node rendering
  const nodeThreeObject = useCallback(
    (node: any) => {
      // Return null to use default sphere rendering
      // The color is set via nodeColor prop
      return null
    },
    []
  )

  // Memoize graph data transformation
  const graphData = useMemo(
    () => ({
      nodes: (data.nodes || []).map((node) => ({
        ...node,
      })),
      links: (data.links || []).map((link) => ({
        ...link,
        source: typeof link.source === 'string' ? link.source : link.source.id,
        target: typeof link.target === 'string' ? link.target : link.target.id,
      })),
    }),
    [data]
  )

  // Common props for both 2D and 3D
  const commonProps = {
    ref: graphRef,
    graphData: graphData,
    width: dimensions.width,
    height: dimensions.height,
    onNodeClick: handleNodeClick,
    onNodeRightClick: handleNodeRightClick,
    onNodeHover: (node: any) => {
      hoveredNodeRef.current = node?.id || null
      setTooltipNode(node?.id || null)
    },
    onLinkHover: (link: any) => {
      hoveredLinkRef.current = link?.id || null
    },
    linkDirectionalArrowLength: 4,
    linkDirectionalArrowRelPos: 0.9,
    backgroundColor: '#2a2318',
    nodeColor: (node: any) => getTypeColor(node.type),
    linkColor: () => 'rgba(139, 119, 90, 0.4)',
    ...currentPhysics.config,
  }

  // DAG mode props (only for 2D)
  const dagProps =
    layoutMode && layoutMode !== 'force'
      ? {
          dagMode: layoutMode,
          dagLevelDistance: 60,
        }
      : {}

  return (
    <div
      id="knowledge-graph-container"
      className="w-full h-full bg-[#2a2318] relative border-2 border-[hsl(30_25%_30%)]"
    >
      {/* Controls */}
      <div className="absolute top-3 right-3 z-10 flex gap-2">
        {/* View Mode Toggle (2D/3D) */}
        <div className="flex bg-[#3d3426] rounded-md border border-[#6b5a45] overflow-hidden">
          <Button
            variant="ghost"
            size="sm"
            className={`rounded-none px-3 ${viewMode === '2d' ? 'bg-[#4d4436] text-[#e8dcc8]' : 'text-[#8a7a66] hover:text-[#e8dcc8]'}`}
            onClick={() => setViewMode('2d')}
          >
            <Network className="h-4 w-4 mr-1" />
            2D
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`rounded-none px-3 ${viewMode === '3d' ? 'bg-[#4d4436] text-[#e8dcc8]' : 'text-[#8a7a66] hover:text-[#e8dcc8]'}`}
            onClick={() => setViewMode('3d')}
          >
            <Box className="h-4 w-4 mr-1" />
            3D
          </Button>
        </div>

        {/* Layout Mode Dropdown (only for 2D) */}
        {viewMode === '2d' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="bg-[#3d3426] border-[#6b5a45] text-[#e8dcc8] hover:bg-[#4d4436]"
              >
                {currentLayout.icon}
                <span className="ml-2">{currentLayout.label}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-[#3d3426] border-[#6b5a45]">
              <DropdownMenuLabel className="text-[#b8a88a]">Layout</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-[#6b5a45]" />
              {layoutOptions.map((option) => (
                <DropdownMenuItem
                  key={option.mode}
                  onClick={() => setLayoutMode(option.mode)}
                  className={`text-[#e8dcc8] focus:bg-[#4d4436] focus:text-[#e8dcc8] ${
                    layoutMode === option.mode ? 'bg-[#4d4436]' : ''
                  }`}
                >
                  {option.icon}
                  <span className="ml-2">{option.label}</span>
                  <span className="ml-auto text-xs text-[#8a7a66]">{option.description}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Physics Preset Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="bg-[#3d3426] border-[#6b5a45] text-[#e8dcc8] hover:bg-[#4d4436]"
            >
              {currentPhysics.icon}
              <span className="ml-2">{currentPhysics.label}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-[#3d3426] border-[#6b5a45]">
            <DropdownMenuLabel className="text-[#b8a88a]">Physics</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-[#6b5a45]" />
            {physicsOptions.map((option) => (
              <DropdownMenuItem
                key={option.preset}
                onClick={() => setPhysicsPreset(option.preset)}
                className={`text-[#e8dcc8] focus:bg-[#4d4436] focus:text-[#e8dcc8] ${
                  physicsPreset === option.preset ? 'bg-[#4d4436]' : ''
                }`}
              >
                {option.icon}
                <span className="ml-2">{option.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* 2D Graph */}
      {viewMode === '2d' && (
        <ForceGraph2D
          {...commonProps}
          {...dagProps}
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
          linkCurvature={0.1}
          onEngineStop={() => {
            if (!centerId) {
              graphRef.current?.zoomToFit(400, 50)
            }
          }}
        />
      )}

      {/* 3D Graph */}
      {viewMode === '3d' && (
        <ForceGraph3D
          {...commonProps}
          nodeLabel={(node: any) => `<div style="background: rgba(42,35,24,0.95); color: #e8dcc8; padding: 4px 8px; border-radius: 4px; font-family: Cinzel, serif;">${node.name}<br/><span style="color: #b8a88a; font-size: 0.8em; font-family: Crimson Pro, serif;">${node.type?.replace('_', ' ')}</span></div>`}
          linkLabel={(link: any) => `<div style="background: rgba(42,35,24,0.95); color: #d4a942; padding: 4px 8px; border-radius: 4px;">${link.label || link.type}</div>`}
          nodeOpacity={0.9}
          linkOpacity={0.4}
          linkWidth={1.5}
          nodeResolution={16}
          onEngineStop={() => {
            if (!centerId) {
              graphRef.current?.zoomToFit(400, 50)
            }
          }}
        />
      )}

      {/* Tooltip for hovered node - parchment style (2D only) */}
      {viewMode === '2d' && tooltipNode && (
        <div className="absolute top-4 left-4 bg-[#3d3426] border-2 border-[#6b5a45] rounded-sm p-3 pointer-events-none shadow-lg">
          <p
            className="font-medium text-[#e8dcc8]"
            style={{ fontFamily: 'Cinzel, serif' }}
          >
            {data.nodes.find((n) => n.id === tooltipNode)?.name}
          </p>
          <p
            className="text-sm text-[#b8a88a] capitalize"
            style={{ fontFamily: 'Crimson Pro, serif' }}
          >
            {data.nodes.find((n) => n.id === tooltipNode)?.type?.replace('_', ' ')}
          </p>
          <p className="text-xs text-[#8a7a66] mt-1">Click to view, right-click to center</p>
        </div>
      )}

      {/* Help text */}
      <div className="absolute bottom-3 left-3 text-xs text-[#6b5a45]">
        {viewMode === '2d' ? 'Scroll to zoom • Drag to pan' : 'Drag to rotate • Scroll to zoom'}
      </div>
    </div>
  )
}
