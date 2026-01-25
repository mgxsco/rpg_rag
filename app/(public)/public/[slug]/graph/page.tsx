'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { KnowledgeGraph } from '@/components/graph/knowledge-graph'
import { ErrorBoundary, GraphErrorFallback } from '@/components/ui/error-boundary'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Filter, RotateCcw } from 'lucide-react'

interface GraphNode {
  id: string
  name: string
  canonicalName: string
  type: string
  group: number
}

interface GraphLink {
  id: string
  source: string
  target: string
  type: string
  label: string
  reverseLabel?: string
}

interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

interface GraphStats {
  totalNodes: number
  totalLinks: number
  nodesByType: Record<string, number>
  linksByType: Record<string, number>
}

// Medieval/Fantasy color palette for entity types
const TYPE_COLORS: Record<string, string> = {
  npc: '#4a7c59',
  player_character: '#2d5a3d',
  creature: '#6b8e4e',
  location: '#c4883a',
  region: '#a67c3d',
  item: '#7b5ea7',
  artifact: '#9b6bb5',
  spell: '#8e6faf',
  ability: '#a077bf',
  quest: '#8b3a3a',
  event: '#a04545',
  faction: '#b5651d',
  organization: '#cd7f32',
  lore: '#4a5568',
  session: '#3d5a80',
  deity: '#d4a942',
  race: '#457b6d',
  class: '#5c7a5e',
  condition: '#8b4513',
  material: '#6b5344',
}

const FALLBACK_COLORS = ['#6b5344', '#5c5c5c', '#7a6a5a', '#4a5568', '#5a4a3a']

function getTypeColor(type: string): string {
  if (TYPE_COLORS[type]) return TYPE_COLORS[type]
  const hash = type.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length]
}

function formatEntityType(type: string): string {
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export default function PublicGraphPage() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [stats, setStats] = useState<GraphStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())
  const [centerId, setCenterId] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    loadGraphData()
  }, [slug])

  const loadGraphData = async (centerEntity?: string, filterType?: string) => {
    setLoading(true)
    try {
      let url = `/api/public/campaigns/${slug}/graph`
      const queryParams = new URLSearchParams()
      if (centerEntity) {
        queryParams.set('center', centerEntity)
        queryParams.set('depth', '2')
      }
      if (filterType) {
        queryParams.set('type', filterType)
      }
      if (queryParams.toString()) {
        url += `?${queryParams.toString()}`
      }

      const response = await fetch(url)
      if (!response.ok) {
        console.error('Graph API error:', response.status)
        setGraphData(null)
        setStats(null)
        return
      }
      const data = await response.json()
      if (data.graphData && Array.isArray(data.graphData.nodes) && Array.isArray(data.graphData.links)) {
        setGraphData(data.graphData)
        setStats(data.stats)
      } else {
        console.error('Invalid graph data structure:', data)
        setGraphData(null)
        setStats(null)
      }
    } catch (error) {
      console.error('Failed to load graph data:', error)
      setGraphData(null)
      setStats(null)
    } finally {
      setLoading(false)
    }
  }

  const handleNodeClick = (nodeId: string) => {
    router.push(`/public/${slug}/entities/${nodeId}`)
  }

  const handleNodeDoubleClick = (nodeId: string) => {
    setCenterId(nodeId)
    loadGraphData(nodeId)
  }

  const toggleTypeFilter = (type: string) => {
    const newSelected = new Set(selectedTypes)
    if (newSelected.has(type)) {
      newSelected.delete(type)
    } else {
      newSelected.add(type)
    }
    setSelectedTypes(newSelected)
  }

  const resetGraph = () => {
    setCenterId(null)
    setSelectedTypes(new Set())
    loadGraphData()
  }

  // Filter graph data based on selected types
  const filteredData = graphData && graphData.nodes && graphData.links ? {
    nodes: selectedTypes.size > 0
      ? graphData.nodes.filter(n => selectedTypes.has(n.type))
      : graphData.nodes,
    links: selectedTypes.size > 0
      ? graphData.links.filter(l => {
          const sourceNode = graphData.nodes.find(n => n.id === l.source || (l.source as any).id === n.id)
          const targetNode = graphData.nodes.find(n => n.id === l.target || (l.target as any).id === n.id)
          return sourceNode && targetNode && selectedTypes.has(sourceNode.type) && selectedTypes.has(targetNode.type)
        })
      : graphData.links,
  } : null

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Knowledge Graph</h1>
          {stats && (
            <p className="text-muted-foreground">
              {stats.totalNodes} entities, {stats.totalLinks} connections
            </p>
          )}
        </div>
        {(centerId || selectedTypes.size > 0) && (
          <Button variant="outline" size="sm" onClick={resetGraph}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset View
          </Button>
        )}
      </div>

      {/* Type filters */}
      {stats && Object.keys(stats.nodesByType).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="flex items-center gap-2 mr-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Filter:</span>
          </div>
          {Object.entries(stats.nodesByType)
            .sort(([, a], [, b]) => b - a)
            .map(([typeValue, count]) => {
              const color = getTypeColor(typeValue)
              const isSelected = selectedTypes.has(typeValue)
              return (
                <Badge
                  key={typeValue}
                  variant={isSelected ? 'default' : 'outline'}
                  className="cursor-pointer"
                  style={isSelected ? { backgroundColor: color } : undefined}
                  onClick={() => toggleTypeFilter(typeValue)}
                >
                  <div
                    className="w-2 h-2 rounded-full mr-1"
                    style={{ backgroundColor: color }}
                  />
                  {formatEntityType(typeValue)} ({count})
                </Badge>
              )
            })}
        </div>
      )}

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="h-[calc(100vh-320px)] md:h-[600px] flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredData && filteredData.nodes.length > 0 ? (
            <div className="h-[calc(100vh-320px)] md:h-[600px]">
              <ErrorBoundary fallback={<GraphErrorFallback onRetry={resetGraph} />}>
                <KnowledgeGraph
                  data={filteredData}
                  onNodeClick={handleNodeClick}
                  onNodeDoubleClick={handleNodeDoubleClick}
                  centerId={centerId}
                />
              </ErrorBoundary>
            </div>
          ) : (
            <div className="h-[calc(100vh-320px)] md:h-[600px] flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <p className="text-lg font-medium mb-2">No entities yet</p>
                <p className="text-sm">
                  This campaign doesn't have any public entities to display.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      {stats && Object.keys(stats.nodesByType).length > 0 && (
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          {Object.keys(stats.nodesByType)
            .sort()
            .map((typeValue) => (
              <div key={typeValue} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: getTypeColor(typeValue) }}
                />
                <span>{formatEntityType(typeValue)}</span>
              </div>
            ))}
        </div>
      )}

      <p className="mt-4 text-sm text-muted-foreground">
        Click a node to view the entity. Double-click to center the graph on that entity.
      </p>
    </div>
  )
}
